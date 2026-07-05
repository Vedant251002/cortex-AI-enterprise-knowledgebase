import csv
import io
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.security import require_role
from app.schemas.audit import AuditListResponse
from app.schemas.auth import CurrentUser
from app.services.audit import export_audit_events, query_audit_events

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=AuditListResponse)
async def list_audit_events(
    user_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    document: str | None = None,
    page_size: int = Query(25, ge=1, le=200),
    continuation_token: str | None = None,
    user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    items, next_continuation_token = await query_audit_events(
        user_id=user_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
        document=document,
        max_item_count=page_size,
        continuation_token=continuation_token,
    )
    return {"items": items, "next_continuation_token": next_continuation_token}


@router.get("/export")
async def export_audit(
    user_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    document: str | None = None,
    format: str = Query("csv", pattern="^(csv|json)$"),
    user: CurrentUser = Depends(require_role("admin")),
) -> Response:
    filters = {
        "user_id": user_id,
        "event_type": event_type,
        "date_from": date_from,
        "date_to": date_to,
        "document": document,
    }
    items = await export_audit_events(filters=filters)

    if format == "json":
        return Response(
            content=json.dumps(items, indent=2, default=str),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_export.json"},
        )

    buffer = io.StringIO()
    fieldnames = [
        "id",
        "timestamp",
        "user_id",
        "user_email",
        "user_role",
        "event_type",
        "action",
        "resource",
        "ip_address",
        "session_id",
        "details",
        "token_usage",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in items:
        row = dict(row)
        if "details" in row:
            row["details"] = json.dumps(row["details"], default=str)
        if "token_usage" in row:
            row["token_usage"] = json.dumps(row["token_usage"], default=str)
        writer.writerow(row)

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_export.csv"},
    )
