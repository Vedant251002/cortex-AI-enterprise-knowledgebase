"""Retrieval-augmented generation helpers: RBAC-filtered hybrid search and grounded prompting.

Conversation history is currently kept in a module-level in-memory dict, keyed by session_id.
This is fine for a single-process demo. Upgrade path: swap CONVERSATIONS for a Redis-backed
store (e.g. a Redis list per session_id with a TTL) so history survives process restarts and
works across multiple uvicorn/gunicorn workers.
"""

import asyncio
from typing import Any

from azure.search.documents.models import VectorizedQuery

from app.core.azure_clients import get_embedding_client, get_openai_client, get_search_client
from app.core.config import get_settings
from app.core.retry import with_azure_retry

try:
    import tiktoken

    _ENCODING = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover - tiktoken not installed / offline
    _ENCODING = None

# Module-level in-memory conversation store: session_id -> list of {"role", "content"}.
# See module docstring for the Redis upgrade path.
CONVERSATIONS: dict[str, list[dict]] = {}

SEMANTIC_CONFIGURATION_NAME = "kb-semantic-config"  # must match scripts/create_search_index.py's SEMANTIC_CONFIG_NAME
MAX_HISTORY_TOKENS = 3000

SYSTEM_PROMPT = (
    "You are the Cortex Enterprise Knowledge Assistant. Answer ONLY using the numbered context "
    "chunks provided below the question. Cite the sources you used inline with bracketed numbers "
    "matching the chunk numbers, e.g. [1], [2]. Do not use any outside knowledge. "
    "If the provided context does not contain enough information to answer the question, "
    "respond with exactly this sentence and nothing else: "
    "\"I don't have enough information to answer that.\""
)


def build_search_filter(categories: list[str]) -> str:
    """Build an OData filter restricting results to the caller's allowed document categories.

    This is the RBAC enforcement point for retrieval: chunks outside `categories` must never
    be returned by search, so the LLM can never see them.
    """
    if not categories:
        # No categories => match nothing. `search.in` with an empty set isn't valid OData,
        # so fall back to an always-false filter.
        return "document_category eq null and document_category ne null"

    clauses = [f"document_category eq '{_escape_odata_literal(c)}'" for c in categories]
    return " or ".join(clauses)


def _escape_odata_literal(value: str) -> str:
    # OData string literals escape a single quote by doubling it.
    return value.replace("'", "''")


@with_azure_retry()
def _embed_query_sync(query: str) -> tuple[list[float], int]:
    settings = get_settings()
    client = get_embedding_client()
    response = client.embeddings.create(model=settings.azure_openai_embedding_deployment, input=[query])
    tokens = response.usage.total_tokens if response.usage else 0
    return response.data[0].embedding, tokens


@with_azure_retry()
def _run_search_sync(
    query: str,
    vector: list[float],
    odata_filter: str,
    top_k: int,
    use_semantic: bool,
) -> list[dict]:
    settings = get_settings()
    client = get_search_client()

    vector_query = VectorizedQuery(vector=vector, k_nearest_neighbors=top_k, fields="content_vector")

    search_kwargs: dict[str, Any] = {
        "search_text": query,
        "vector_queries": [vector_query],
        "filter": odata_filter,
        "top": top_k,
        "select": [
            "content",
            "document_name",
            "page_number",
            "section_heading",
            "chunk_index",
            "document_category",
        ],
    }
    if use_semantic:
        search_kwargs["query_type"] = "semantic"
        search_kwargs["semantic_configuration_name"] = SEMANTIC_CONFIGURATION_NAME

    results = client.search(**search_kwargs)
    return list(results)


async def hybrid_search(query: str, categories: list[str], top_k: int) -> tuple[list[dict], int]:
    """Run RBAC-filtered hybrid (BM25 + vector [+ semantic]) search and return normalized hits
    plus the embedding token count spent generating the query vector (for usage tracking).

    Falls back to plain hybrid search (no semantic re-ranking) if the index has no semantic
    configuration yet, or if the semantic query fails for any other reason.
    """
    odata_filter = build_search_filter(categories)
    vector, embedding_tokens = await asyncio.to_thread(_embed_query_sync, query)

    try:
        raw_results = await asyncio.to_thread(_run_search_sync, query, vector, odata_filter, top_k, True)
    except Exception:
        raw_results = await asyncio.to_thread(_run_search_sync, query, vector, odata_filter, top_k, False)

    normalized: list[dict] = []
    for doc in raw_results:
        score = doc.get("@search.reranker_score")
        if score is None:
            score = doc.get("@search.score", 0.0)
        normalized.append(
            {
                "content": doc.get("content", ""),
                "document_name": doc.get("document_name", ""),
                "page_number": doc.get("page_number"),
                "section_heading": doc.get("section_heading"),
                "chunk_index": doc.get("chunk_index"),
                "score": score,
            }
        )
    return normalized, embedding_tokens


def _count_tokens(text: str) -> int:
    if _ENCODING is not None:
        try:
            return len(_ENCODING.encode(text))
        except Exception:
            pass
    # Rough fallback: ~4 characters per token.
    return max(1, len(text) // 4)


def _trim_history(history: list[dict], max_tokens: int) -> list[dict]:
    """Keep the most recent turns whose combined estimated token count fits max_tokens.

    Drops oldest turns first.
    """
    kept: list[dict] = []
    total = 0
    for turn in reversed(history):
        turn_tokens = _count_tokens(turn.get("content", ""))
        if total + turn_tokens > max_tokens:
            break
        kept.append(turn)
        total += turn_tokens
    kept.reverse()
    return kept


def build_grounded_prompt(query: str, chunks: list[dict], history: list[dict]) -> list[dict]:
    """Build the OpenAI chat `messages` list for a grounded, cited answer."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if chunks:
        context_parts = []
        for i, chunk in enumerate(chunks, start=1):
            page = chunk.get("page_number")
            page_str = f" p.{page}" if page is not None else ""
            header = f"### [{i}] {chunk.get('document_name', 'unknown')}{page_str}"
            context_parts.append(f"{header}\n{chunk.get('content', '')}")
        context_block = "\n\n".join(context_parts)
    else:
        context_block = "(no relevant context was retrieved)"

    trimmed_history = _trim_history(history, MAX_HISTORY_TOKENS)
    for turn in trimmed_history:
        role = turn.get("role")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": turn.get("content", "")})

    user_message = f"Context:\n\n{context_block}\n\nQuestion: {query}"
    messages.append({"role": "user", "content": user_message})

    return messages
