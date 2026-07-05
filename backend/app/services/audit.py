"""Append-only audit log writes. No update/delete path exists on purpose — that is the
tamper-evidence story for the audit trail. Query/pagination/export live in api/audit.py (Phase 4).
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi import HTTPException

from app.core.azure_clients import get_audit_container

VALID_EVENT_TYPES = {
    "login",
    "logout",
    "document_upload",
    "document_delete",
    "chat_query",
    "content_safety_flag",
    "rbac_denial",
    "admin_action",
}


async def log_audit_event(
    *,
    user_id: str,
    user_email: str,
    user_role: str,
    event_type: str,
    action: str,
    resource: str,
    ip_address: str,
    session_id: str,
    details: dict[str, Any] | None = None,
    token_usage: dict[str, int] | None = None,
) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "user_email": user_email,
        "user_role": user_role,
        "event_type": event_type,
        "action": action,
        "resource": resource,
        "ip_address": ip_address,
        "session_id": session_id,
        "details": details or {},
    }
    if token_usage is not None:
        doc["token_usage"] = token_usage

    get_audit_container().create_item(body=doc)


def _build_audit_query(
    *,
    user_id: str | None,
    event_type: str | None,
    date_from: str | None,
    date_to: str | None,
    document: str | None,
) -> tuple[str, list[dict[str, Any]]]:
    """Builds a parameterized Cosmos SQL query with optional filters, ordered by timestamp desc."""
    conditions: list[str] = []
    parameters: list[dict[str, Any]] = []

    if user_id is not None:
        conditions.append("c.user_id = @user_id")
        parameters.append({"name": "@user_id", "value": user_id})
    if event_type is not None:
        conditions.append("c.event_type = @event_type")
        parameters.append({"name": "@event_type", "value": event_type})
    if date_from is not None:
        conditions.append("c.timestamp >= @date_from")
        parameters.append({"name": "@date_from", "value": date_from})
    if date_to is not None:
        conditions.append("c.timestamp <= @date_to")
        parameters.append({"name": "@date_to", "value": date_to})
    if document is not None:
        conditions.append("CONTAINS(c.resource, @document)")
        parameters.append({"name": "@document", "value": document})

    query = "SELECT * FROM c"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY c.timestamp DESC"

    return query, parameters


async def query_audit_events(
    *,
    user_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    document: str | None = None,
    max_item_count: int = 25,
    continuation_token: str | None = None,
) -> tuple[list[dict], str | None]:
    """Paginated, filtered read of the audit trail, newest first.

    Uses the azure-cosmos v4 ItemPaged pagination API: query_items() returns an ItemPaged,
    whose .by_page(continuation_token=...) yields a page iterator. Advancing that iterator
    once (via next()) fetches a single page and populates page_iterator.continuation_token
    with the value from the `x-ms-continuation` response header (or None once exhausted).
    """
    query, parameters = _build_audit_query(
        user_id=user_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
        document=document,
    )

    container = get_audit_container()
    item_paged = container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True,
        max_item_count=max_item_count,
    )
    page_iterator = item_paged.by_page(continuation_token=continuation_token)

    try:
        page = next(page_iterator)
    except StopIteration:
        return [], None
    except CosmosHttpResponseError as exc:
        # Continuation tokens are opaque and not guaranteed valid indefinitely (e.g. after a
        # partition split or once enough time has passed) - surface this as a normal 400 so it
        # reaches the client with CORS headers intact, instead of an unhandled 500 that Starlette's
        # CORS middleware never gets to attach headers to (which the browser then reports to the
        # frontend as a generic "Failed to fetch").
        if exc.status_code == 400:
            raise HTTPException(
                status_code=400,
                detail="This page of results has expired. Please reload the audit trail from the start.",
            ) from exc
        raise

    items = list(page)
    next_token = page_iterator.continuation_token
    return items, next_token


async def export_audit_events(*, filters: dict[str, Any], max_item_count: int = 10000) -> list[dict]:
    """Same filters as query_audit_events but no pagination cap (bounded by max_item_count),
    for CSV/JSON export.
    """
    query, parameters = _build_audit_query(
        user_id=filters.get("user_id"),
        event_type=filters.get("event_type"),
        date_from=filters.get("date_from"),
        date_to=filters.get("date_to"),
        document=filters.get("document"),
    )

    container = get_audit_container()
    item_paged = container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True,
        max_item_count=max_item_count,
    )

    items: list[dict] = []
    for page in item_paged.by_page():
        items.extend(page)
        if len(items) >= max_item_count:
            break

    return items[:max_item_count]
