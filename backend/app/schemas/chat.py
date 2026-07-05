from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    # Lets the frontend keep several independent conversations alive per user (see
    # services/rag.py CONVERSATIONS). Omit to keep the old one-conversation-per-login behavior.
    thread_id: str | None = None


class Citation(BaseModel):
    document_name: str | None
    page_number: int | None
    excerpt: str


class TokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatDoneEvent(BaseModel):
    """Shape of the final SSE `done` event. Streamed as JSON text (SSE has no schema
    enforcement of its own), but built through this model so the payload is validated
    the same way every other response in the app is, instead of a hand-assembled dict."""

    citations: list[Citation] = []
    usage: TokenUsage | None = None
    latency_ms: float
    output_flagged: bool = False
    blocked: bool = False
    quota_exceeded: bool = False
