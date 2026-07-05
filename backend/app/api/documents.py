from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.core.azure_clients import get_blob_container_client, get_search_client
from app.core.security import get_current_user, require_categories, require_role, visible_categories
from app.models.documents import DocumentMetadata, delete_document, find_document, list_documents, move_document_category
from app.schemas.auth import CurrentUser
from app.schemas.documents import DeleteResponse, UpdateCategoryRequest
from app.services.audit import log_audit_event
from app.services.ingestion import IngestionError, extract_and_index, upload_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DocumentMetadata)
async def create_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form(...),
    user: CurrentUser = Depends(require_role("admin", "analyst")),
    _category_ok: CurrentUser = Depends(require_categories(source="form", param="category")),
) -> dict[str, Any]:
    file_bytes = await file.read()
    try:
        doc = await upload_document(
            file_bytes=file_bytes,
            filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            category=category,
            user_id=user.id,
        )
    except IngestionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    background_tasks.add_task(
        log_audit_event,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        event_type="document_upload",
        action="POST /documents",
        resource=doc["id"],
        ip_address=request.client.host if request.client else "unknown",
        session_id=user.session_id,
        details={"document_name": doc["document_name"], "category": category, "status": "uploaded"},
    )

    background_tasks.add_task(extract_and_index, doc["id"])

    return doc


@router.get("", response_model=list[DocumentMetadata])
async def get_documents(user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    categories = visible_categories(user)
    return await list_documents(categories=categories)


@router.get("/{document_id}/status", response_model=DocumentMetadata)
async def get_document_status(document_id: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    doc = await find_document(document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc["document_category"] not in visible_categories(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted to view this document")
    return doc


@router.delete("/{document_id}", response_model=DeleteResponse)
async def remove_document(
    document_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_role("admin", "analyst")),
) -> dict[str, str]:
    doc = await find_document(document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    is_own_document = doc["uploaded_by"] == user.id
    if user.role != "admin" and not is_own_document:
        await log_audit_event(
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            event_type="rbac_denial",
            action=f"{request.method} {request.url.path}",
            resource=document_id,
            ip_address=request.client.host if request.client else "unknown",
            session_id=user.session_id,
            details={"reason": "not the document owner"},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only delete your own uploads")

    # 1. Remove the raw blob.
    container = get_blob_container_client()
    blob_client = container.get_blob_client(doc["blob_path"])
    if blob_client.exists():
        blob_client.delete_blob()

    # 2. Remove all indexed chunks for this document (chunk ids are "{document_id}_{chunk_index}").
    search_client = get_search_client()
    results = search_client.search(
        search_text="*",
        filter=f"document_name eq '{doc['document_name']}' and document_category eq '{doc['document_category']}'",
        select=["id"],
        top=1000,
    )
    chunk_ids = [{"id": r["id"]} for r in results if r["id"].startswith(f"{document_id}_")]
    if chunk_ids:
        search_client.delete_documents(documents=chunk_ids)

    # 3. Remove the tracking doc.
    await delete_document(document_id, doc["document_category"])

    background_tasks.add_task(
        log_audit_event,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        event_type="document_delete",
        action="DELETE /documents/{id}",
        resource=document_id,
        ip_address=request.client.host if request.client else "unknown",
        session_id=user.session_id,
        details={"document_name": doc["document_name"], "chunks_removed": len(chunk_ids)},
    )

    if user.role == "admin" and not is_own_document:
        background_tasks.add_task(
            log_audit_event,
            user_id=user.id,
            user_email=user.email,
            user_role=user.role,
            event_type="admin_action",
            action="DELETE /documents/{id}",
            resource=document_id,
            ip_address=request.client.host if request.client else "unknown",
            session_id=user.session_id,
            details={"document_name": doc["document_name"], "original_owner": doc["uploaded_by"]},
        )

    return {"id": document_id, "status": "deleted"}


@router.patch("/{document_id}/category", response_model=DocumentMetadata)
async def update_document_category(
    document_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    payload: UpdateCategoryRequest,
    user: CurrentUser = Depends(require_role("admin")),
    _category_ok: CurrentUser = Depends(require_categories(source="json", param="category")),
) -> dict[str, Any]:
    doc = await find_document(document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    old_category = doc["document_category"]
    doc = await move_document_category(doc, payload.category)

    search_client = get_search_client()
    results = search_client.search(
        search_text="*",
        filter=f"document_name eq '{doc['document_name']}' and document_category eq '{old_category}'",
        select=["id"],
        top=1000,
    )
    chunk_updates = [
        {"id": r["id"], "document_category": payload.category} for r in results if r["id"].startswith(f"{document_id}_")
    ]
    if chunk_updates:
        search_client.merge_or_upload_documents(documents=chunk_updates)

    background_tasks.add_task(
        log_audit_event,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        event_type="admin_action",
        action="PATCH /documents/{id}/category",
        resource=document_id,
        ip_address=request.client.host if request.client else "unknown",
        session_id=user.session_id,
        details={"document_name": doc["document_name"], "old_category": old_category, "new_category": payload.category},
    )

    return doc
