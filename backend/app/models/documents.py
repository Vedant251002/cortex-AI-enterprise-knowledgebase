"""Cosmos container-backed document metadata tracker.

The shared data model (see app/core/azure_clients.py) only defines audit_logs and
user_usage containers. Real-time upload/ingestion status tracking (for the frontend's
2s polling loop) needs its own container, so this module owns a third one:
get_documents_container() in app/core/azure_clients.py.

Each document metadata doc looks like:
    {
        "id": "<uuid>",
        "document_name": "quarterly_report.pdf",
        "document_category": "finance",
        "uploaded_by": "<user_id>",
        "upload_timestamp": "<iso8601>",
        "status": "uploaded" | "extracting" | "chunking" | "indexing" | "ready" | "failed",
        "page_count": 0,
        "chunk_count": 0,
        "blob_path": "finance/<uuid>_quarterly_report.pdf",
        "error_message": None,
    }
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from azure.cosmos.exceptions import CosmosResourceNotFoundError
from pydantic import BaseModel

from app.core.azure_clients import get_documents_container

DocumentStatus = Literal["uploaded", "extracting", "chunking", "indexing", "ready", "failed"]


class DocumentMetadata(BaseModel):
    id: str
    document_name: str
    document_category: str
    uploaded_by: str
    upload_timestamp: str
    status: DocumentStatus = "uploaded"
    page_count: int = 0
    chunk_count: int = 0
    blob_path: str
    error_message: str | None = None


def new_document_metadata(
    *,
    document_name: str,
    document_category: str,
    uploaded_by: str,
    blob_path: str,
) -> dict[str, Any]:
    """Build a fresh document metadata dict (status="uploaded"). Does not persist it."""
    return {
        "id": str(uuid.uuid4()),
        "document_name": document_name,
        "document_category": document_category,
        "uploaded_by": uploaded_by,
        "upload_timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "uploaded",
        "page_count": 0,
        "chunk_count": 0,
        "blob_path": blob_path,
        "error_message": None,
    }


async def create_document(doc: dict[str, Any]) -> dict[str, Any]:
    get_documents_container().create_item(body=doc)
    return doc


async def get_document(document_id: str, document_category: str) -> dict[str, Any] | None:
    """Point read. Requires the partition key (document_category) for efficiency."""
    try:
        return get_documents_container().read_item(item=document_id, partition_key=document_category)
    except CosmosResourceNotFoundError:
        return None


async def find_document(document_id: str) -> dict[str, Any] | None:
    """Cross-partition lookup by id only, for callers that don't know the category upfront."""
    container = get_documents_container()
    query = "SELECT * FROM c WHERE c.id = @id"
    items = list(
        container.query_items(
            query=query,
            parameters=[{"name": "@id", "value": document_id}],
            enable_cross_partition_query=True,
        )
    )
    return items[0] if items else None


async def list_documents(categories: list[str] | None = None) -> list[dict[str, Any]]:
    """List documents, optionally filtered to a set of categories (RBAC). None/omitted means all."""
    container = get_documents_container()
    if categories is None:
        query = "SELECT * FROM c ORDER BY c.upload_timestamp DESC"
        return list(container.query_items(query=query, enable_cross_partition_query=True))

    if not categories:
        return []

    placeholders = ", ".join(f"@cat{i}" for i in range(len(categories)))
    query = f"SELECT * FROM c WHERE c.document_category IN ({placeholders}) ORDER BY c.upload_timestamp DESC"
    parameters = [{"name": f"@cat{i}", "value": cat} for i, cat in enumerate(categories)]
    return list(
        container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True,
        )
    )


async def update_document(doc: dict[str, Any]) -> dict[str, Any]:
    get_documents_container().upsert_item(body=doc)
    return doc


async def delete_document(document_id: str, document_category: str) -> None:
    try:
        get_documents_container().delete_item(item=document_id, partition_key=document_category)
    except CosmosResourceNotFoundError:
        pass


async def move_document_category(doc: dict[str, Any], new_category: str) -> dict[str, Any]:
    """Change a document's category, which is also the Cosmos partition key.

    Cosmos does not allow changing an item's partition key value in place, so this
    deletes the item under its old partition and re-creates it under the new one.
    """
    old_category = doc["document_category"]
    if old_category == new_category:
        return doc

    container = get_documents_container()
    updated = {**doc, "document_category": new_category}
    container.create_item(body=updated)
    try:
        container.delete_item(item=doc["id"], partition_key=old_category)
    except CosmosResourceNotFoundError:
        pass
    return updated
