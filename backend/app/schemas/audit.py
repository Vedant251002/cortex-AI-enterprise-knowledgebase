from typing import Any

from pydantic import BaseModel


class AuditEventOut(BaseModel):
    id: str
    timestamp: str
    user_id: str
    user_email: str
    user_role: str
    event_type: str
    action: str
    resource: str
    ip_address: str
    session_id: str
    details: dict[str, Any] = {}
    token_usage: dict[str, int] | None = None


class AuditListResponse(BaseModel):
    items: list[AuditEventOut]
    next_continuation_token: str | None
