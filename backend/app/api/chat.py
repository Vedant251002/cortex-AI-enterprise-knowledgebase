"""RAG chat endpoint: content-safety screened, RBAC-filtered, streamed via SSE."""

import asyncio
import json
import time
from typing import Any, AsyncIterator

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.core.azure_clients import get_openai_client
from app.core.config import get_settings
from app.core.retry import with_azure_retry
from app.core.security import get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.chat import ChatDoneEvent, ChatRequest, Citation, TokenUsage
from app.services.audit import log_audit_event
from app.services.rag import CONVERSATIONS, build_grounded_prompt, hybrid_search
from app.services.safety import screen_text
from app.services.usage import get_quota_status, increment_usage

router = APIRouter(prefix="/chat", tags=["chat"])
logger = structlog.get_logger(__name__)

SAFE_FALLBACK_MESSAGE = (
    "I can't help with that request because it may violate content safety guidelines. "
    "Please rephrase your question."
)

OUTPUT_FLAGGED_NOTICE = (
    "Note: part of this response was flagged by our content safety system after generation."
)

QUOTA_EXCEEDED_MESSAGE = (
    "You've reached your daily token quota for the AI assistant. Please try again tomorrow, "
    "or contact an admin to raise your limit."
)


def _excerpt(content: str, length: int = 200) -> str:
    content = content or ""
    return content[:length] + ("..." if len(content) > length else "")


@with_azure_retry()
def _create_chat_stream(client, **kwargs: Any):
    return client.chat.completions.create(**kwargs)


@router.post("")
async def chat(
    payload: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
) -> EventSourceResponse:
    settings = get_settings()
    ip_address = request.client.host if request.client else "unknown"
    start_time = time.perf_counter()
    # A thread_id lets the frontend keep several independent conversations alive at once
    # (see ChatRequest.thread_id) - falls back to the JWT's fixed session_id when omitted, so
    # older clients that never send a thread_id keep behaving exactly as before.
    conversation_key = f"{user.id}:{payload.thread_id}" if payload.thread_id else user.session_id

    # (a) Screen the inbound message. This must be awaited inline since it can block the
    # response — we do not want to spend LLM tokens on unsafe input.
    input_safe, input_details = await screen_text(payload.message)

    if not input_safe:
        background_tasks.add_task(
            log_audit_event,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            event_type="content_safety_flag",
            action="POST /chat",
            resource="/chat",
            ip_address=ip_address,
            session_id=user.session_id,
            details={"stage": "input", "query": payload.message, **input_details},
        )

        async def blocked_generator() -> AsyncIterator[dict]:
            yield {"event": "message", "data": json.dumps({"delta": SAFE_FALLBACK_MESSAGE})}
            yield {
                "event": "done",
                "data": ChatDoneEvent(
                    latency_ms=round((time.perf_counter() - start_time) * 1000, 2),
                    blocked=True,
                ).model_dump_json(),
            }

        return EventSourceResponse(blocked_generator())

    # (a.2) Quota check (§7.3) - block before spending any LLM/embedding tokens at all.
    quota = await get_quota_status(user.id, user.role)
    if quota["exceeded"]:
        background_tasks.add_task(
            log_audit_event,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            event_type="rbac_denial",
            action="POST /chat",
            resource="/chat",
            ip_address=ip_address,
            session_id=user.session_id,
            details={"reason": "daily_token_quota_exceeded", "quota": quota},
        )

        async def quota_blocked_generator() -> AsyncIterator[dict]:
            yield {"event": "message", "data": json.dumps({"delta": QUOTA_EXCEEDED_MESSAGE})}
            yield {
                "event": "done",
                "data": ChatDoneEvent(
                    latency_ms=round((time.perf_counter() - start_time) * 1000, 2),
                    quota_exceeded=True,
                ).model_dump_json(),
            }

        return EventSourceResponse(quota_blocked_generator())

    # (b) Retrieve RBAC-filtered context and build the grounded prompt.
    chunks, query_embedding_tokens = await hybrid_search(payload.message, user.categories, settings.rag_top_k)
    history = CONVERSATIONS.get(conversation_key, [])
    messages = build_grounded_prompt(payload.message, chunks, history)

    client = get_openai_client()

    async def event_generator() -> AsyncIterator[dict]:
        full_response = ""
        usage: dict[str, int] | None = None

        stream = await asyncio.to_thread(
            _create_chat_stream,
            client,
            model=settings.azure_openai_chat_deployment,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
        )

        def next_chunk(iterator):
            try:
                return next(iterator), False
            except StopIteration:
                return None, True

        iterator = iter(stream)
        while True:
            chunk, done = await asyncio.to_thread(next_chunk, iterator)
            if done:
                break

            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    full_response += delta.content
                    yield {"event": "message", "data": json.dumps({"delta": delta.content})}

            if chunk.usage is not None:
                usage = {
                    "prompt_tokens": chunk.usage.prompt_tokens,
                    "completion_tokens": chunk.usage.completion_tokens,
                    "total_tokens": chunk.usage.total_tokens,
                }

        # (c) Screen the full completed answer too (output screening).
        output_safe, output_details = await screen_text(full_response) if full_response else (True, {})
        if not output_safe:
            background_tasks.add_task(
                log_audit_event,
                user_id=user.id,
                user_email=user.email,
                user_role=user.role,
                event_type="content_safety_flag",
                action="POST /chat",
                resource="/chat",
                ip_address=ip_address,
                session_id=user.session_id,
                details={"stage": "output", "query": payload.message, **output_details},
            )
            yield {
                "event": "message",
                "data": json.dumps({"delta": "", "notice": OUTPUT_FLAGGED_NOTICE}),
            }

        # (e) Update conversation history.
        conversation = CONVERSATIONS.setdefault(conversation_key, [])
        conversation.append({"role": "user", "content": payload.message})
        conversation.append({"role": "assistant", "content": full_response})

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        citations = [
            Citation(
                document_name=c.get("document_name"),
                page_number=c.get("page_number"),
                excerpt=_excerpt(c.get("content", "")),
            )
            for c in chunks
        ]

        # (d) Final done event.
        yield {
            "event": "done",
            "data": ChatDoneEvent(
                citations=citations,
                usage=TokenUsage(**usage) if usage else None,
                latency_ms=latency_ms,
                output_flagged=not output_safe,
            ).model_dump_json(),
        }

        # (f) Fire-and-forget audit + usage tracking.
        top_scores = [c.get("score") for c in chunks]
        background_tasks.add_task(
            log_audit_event,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            event_type="chat_query",
            action="POST /chat",
            resource="/chat",
            ip_address=ip_address,
            session_id=user.session_id,
            details={
                "query": payload.message,
                "chunks_retrieved": len(chunks),
                "top_scores": top_scores,
                "latency_ms": latency_ms,
            },
            token_usage=usage,
        )
        if usage or query_embedding_tokens:
            background_tasks.add_task(
                increment_usage,
                user_id=user.id,
                prompt_tokens=usage.get("prompt_tokens", 0) if usage else 0,
                completion_tokens=usage.get("completion_tokens", 0) if usage else 0,
                embedding_tokens=query_embedding_tokens,
            )

    return EventSourceResponse(event_generator())
