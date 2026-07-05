"""Document ingestion pipeline: upload -> extract (Document Intelligence) -> chunk -> embed -> index.

Pipeline stages update the documents container's status field so the frontend can poll
GET /documents/{id}/status every ~2s:

    uploaded -> extracting -> chunking -> indexing -> ready
                                                    \\-> failed (any stage)
"""

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
import tiktoken
from azure.ai.documentintelligence.models import AnalyzeResult, DocumentTable

from app.core.azure_clients import (
    get_blob_container_client,
    get_document_intelligence_client,
    get_embedding_client,
    get_search_client,
)
from app.core.config import get_settings
from app.core.retry import with_azure_retry
from app.models.documents import find_document, new_document_metadata, update_document
from app.services.audit import log_audit_event
from app.services.usage import increment_usage

logger = structlog.get_logger(__name__)

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/plain": "txt",
}
ALLOWED_EXTENSIONS = {"pdf", "docx", "png", "jpg", "jpeg", "txt"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

_TOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")


class IngestionError(Exception):
    """Raised for user-facing validation failures (bad type, too large, not found)."""


def _extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _count_tokens(text: str) -> int:
    return len(_TOKEN_ENCODING.encode(text, disallowed_special=()))


# --------------------------------------------------------------------------- upload


async def upload_document(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    category: str,
    user_id: str,
) -> dict[str, Any]:
    """Validate, persist raw bytes to blob storage, and create the tracking doc.

    Does NOT run extraction/chunking/indexing - call extract_and_index() separately
    (typically scheduled as a BackgroundTask by the API layer) so the upload request
    returns quickly.
    """
    extension = _extension_of(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise IngestionError(
            f"Unsupported file type '{extension}'. Allowed types: {sorted(ALLOWED_EXTENSIONS)}"
        )

    size = len(file_bytes)
    if size == 0:
        raise IngestionError("Uploaded file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise IngestionError(f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES} bytes.")

    document_id = str(uuid.uuid4())
    blob_path = f"{category}/{document_id}_{filename}"

    container = get_blob_container_client()
    container.upload_blob(
        name=blob_path,
        data=file_bytes,
        overwrite=True,
        metadata={"uploaded_by": user_id, "document_category": category},
        content_settings=_content_settings(content_type),
    )

    doc = new_document_metadata(
        document_name=filename,
        document_category=category,
        uploaded_by=user_id,
        blob_path=blob_path,
    )
    # Keep the id consistent with the blob path we already generated above.
    doc["id"] = document_id
    await update_document(doc)  # upsert works fine for the initial create too

    return doc


def _content_settings(content_type: str):
    from azure.storage.blob import ContentSettings

    return ContentSettings(content_type=content_type) if content_type else None


# --------------------------------------------------------------------------- extraction / chunking / indexing


async def _log_stage_event(doc: dict[str, Any], stage: str, *, extra: dict[str, Any] | None = None) -> None:
    """Every ingestion stage transition gets its own audit event (spec §4.1: "every document
    upload, processing event, and indexing completion must be logged"), not just the final
    ready/failed state."""
    await log_audit_event(
        user_id=doc.get("uploaded_by", "unknown"),
        user_email=doc.get("uploaded_by", "unknown"),
        user_role="system",
        event_type="document_upload",
        action="INGEST document",
        resource=doc.get("id", "unknown"),
        ip_address="internal",
        session_id="ingestion-pipeline",
        details={"document_name": doc.get("document_name"), "status": stage, **(extra or {})},
    )


async def extract_and_index(document_id: str) -> None:
    """Run the full extraction -> chunking -> embedding -> indexing pipeline for a document.

    Resolves the blob to operate on by reading the documents container doc first (never
    trust a caller-supplied blob path).
    """
    doc = await find_document(document_id)
    if doc is None:
        raise IngestionError(f"No document metadata found for id={document_id}")

    try:
        doc["status"] = "extracting"
        await update_document(doc)
        await _log_stage_event(doc, "extracting")

        analyze_result = _run_extraction(doc["blob_path"], doc["document_name"])

        doc["status"] = "chunking"
        await update_document(doc)
        await _log_stage_event(doc, "chunking")
        chunks = _chunk_analyze_result(analyze_result)

        doc["status"] = "indexing"
        await update_document(doc)
        await _log_stage_event(doc, "indexing", extra={"chunk_count": len(chunks)})
        await _embed_and_index_chunks(chunks, doc)

        doc["status"] = "ready"
        doc["page_count"] = len(analyze_result.pages or [])
        doc["chunk_count"] = len(chunks)
        doc["error_message"] = None
        await update_document(doc)

        await _log_stage_event(
            doc,
            "ready",
            extra={"page_count": doc["page_count"], "chunk_count": doc["chunk_count"]},
        )
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any failure must mark the doc failed
        doc["status"] = "failed"
        doc["error_message"] = str(exc)
        await update_document(doc)
        await _log_stage_event(doc, "failed", extra={"error": str(exc)})
        logger.exception("ingestion_failed", document_id=document_id)
        raise


def _run_extraction(blob_path: str, document_name: str) -> Any:
    """Dispatch to Document Intelligence, except for plain text which it can't parse."""
    if _extension_of(document_name) == "txt":
        return _extract_plain_text(blob_path)
    return _run_document_intelligence(blob_path)


@with_azure_retry()
def _run_document_intelligence(blob_path: str) -> AnalyzeResult:
    """Download the blob and run the prebuilt-layout model (handles OCR automatically)."""
    container = get_blob_container_client()
    blob_client = container.get_blob_client(blob_path)
    file_bytes = blob_client.download_blob().readall()

    di_client = get_document_intelligence_client()
    poller = di_client.begin_analyze_document("prebuilt-layout", body=file_bytes)
    return poller.result()


class _PlainTextParagraph:
    """Duck-types the subset of a Document Intelligence paragraph that _chunk_analyze_result reads."""

    __slots__ = ("role", "content", "bounding_regions")

    def __init__(self, content: str):
        self.role = None
        self.content = content
        self.bounding_regions: list[Any] = []


class _PlainTextAnalyzeResult:
    """Duck-types the subset of AnalyzeResult that _chunk_analyze_result reads, for .txt uploads
    (Document Intelligence's prebuilt-layout model doesn't accept plain text)."""

    def __init__(self, text: str):
        self.content = text
        self.paragraphs = [_PlainTextParagraph(p.strip()) for p in text.split("\n\n") if p.strip()]
        self.pages = [None]
        self.tables: list[DocumentTable] = []


def _extract_plain_text(blob_path: str) -> _PlainTextAnalyzeResult:
    container = get_blob_container_client()
    blob_client = container.get_blob_client(blob_path)
    file_bytes = blob_client.download_blob().readall()
    return _PlainTextAnalyzeResult(file_bytes.decode("utf-8", errors="replace"))


# --------------------------------------------------------------------------- chunking


class _Chunk:
    __slots__ = ("content", "page_number", "section_heading", "chunk_index")

    def __init__(self, content: str, page_number: int, section_heading: str, chunk_index: int):
        self.content = content
        self.page_number = page_number
        self.section_heading = section_heading
        self.chunk_index = chunk_index


def _table_to_markdown(table: DocumentTable) -> str:
    """Serialize a DocumentTable into a markdown table."""
    grid: list[list[str]] = [["" for _ in range(table.column_count)] for _ in range(table.row_count)]
    for cell in table.cells:
        text = (cell.content or "").replace("\n", " ").replace("|", "\\|").strip()
        if 0 <= cell.row_index < table.row_count and 0 <= cell.column_index < table.column_count:
            grid[cell.row_index][cell.column_index] = text

    if not grid:
        return ""

    lines = ["| " + " | ".join(grid[0]) + " |", "| " + " | ".join(["---"] * table.column_count) + " |"]
    for row in grid[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _table_page_number(table: DocumentTable) -> int:
    if table.bounding_regions:
        return table.bounding_regions[0].page_number
    return 1


def _paragraph_page_number(paragraph) -> int:
    if paragraph.bounding_regions:
        return paragraph.bounding_regions[0].page_number
    return 1


def _chunk_analyze_result(analyze_result: AnalyzeResult) -> list[_Chunk]:
    """Heading/section-based semantic chunking with a sliding-window token fallback.

    Strategy:
      1. Walk paragraphs in reading order. Any paragraph with role "title" or
         "sectionHeading" starts a new section; its text becomes the section_heading
         for everything that follows until the next heading.
      2. Within each section, accumulate paragraph text and flush a chunk whenever
         the running token count would exceed rag_chunk_token_size, carrying an
         overlap (rag_chunk_overlap_pct) of trailing tokens into the next chunk
         (sliding-window fallback for sections longer than one chunk).
      3. Tables are appended (as markdown) to whichever chunk covers their page,
         matched by page number; a table larger than the remaining budget gets its
         own chunk.
    """
    settings = get_settings()
    max_tokens = settings.rag_chunk_token_size
    overlap_tokens = max(0, int(max_tokens * settings.rag_chunk_overlap_pct))

    paragraphs = analyze_result.paragraphs or []
    heading_roles = {"title", "sectionHeading"}

    sections: list[dict[str, Any]] = []
    current_section = {"heading": "Document", "page_number": 1, "paragraphs": []}

    for paragraph in paragraphs:
        role = paragraph.role or ""
        text = (paragraph.content or "").strip()
        if not text:
            continue
        if role in heading_roles:
            if current_section["paragraphs"]:
                sections.append(current_section)
            current_section = {
                "heading": text,
                "page_number": _paragraph_page_number(paragraph),
                "paragraphs": [],
            }
        elif role in {"pageHeader", "pageFooter", "pageNumber"}:
            continue  # skip boilerplate, doesn't belong in chunk content
        else:
            current_section["paragraphs"].append((text, _paragraph_page_number(paragraph)))

    if current_section["paragraphs"]:
        sections.append(current_section)

    if not sections and analyze_result.content:
        # Fallback: no paragraph structure at all (rare) - chunk the raw content as one section.
        sections = [{"heading": "Document", "page_number": 1, "paragraphs": [(analyze_result.content, 1)]}]

    chunks: list[_Chunk] = []
    chunk_index = 0

    for section in sections:
        heading = section["heading"]
        section_page = section["page_number"]
        paragraph_texts = [p[0] for p in section["paragraphs"]]
        paragraph_pages = [p[1] for p in section["paragraphs"]]

        buffer_words: list[str] = []
        buffer_tokens = 0
        buffer_page = section_page

        def flush(words: list[str], page_number: int) -> None:
            nonlocal chunk_index
            text = " ".join(words).strip()
            if not text:
                return
            chunks.append(_Chunk(content=text, page_number=page_number, section_heading=heading, chunk_index=chunk_index))
            chunk_index += 1

        for text, page in zip(paragraph_texts, paragraph_pages):
            if not buffer_words:
                buffer_page = page
            words = text.split(" ")
            for word in words:
                word_tokens = _count_tokens(word + " ")
                if buffer_tokens + word_tokens > max_tokens and buffer_words:
                    flush(buffer_words, buffer_page)
                    # sliding-window overlap: carry the trailing `overlap_tokens` worth of words forward
                    overlap_words: list[str] = []
                    running = 0
                    for w in reversed(buffer_words):
                        wt = _count_tokens(w + " ")
                        if running + wt > overlap_tokens:
                            break
                        overlap_words.insert(0, w)
                        running += wt
                    buffer_words = overlap_words
                    buffer_tokens = running
                    buffer_page = page
                buffer_words.append(word)
                buffer_tokens += word_tokens

        if buffer_words:
            flush(buffer_words, buffer_page)

    # Attach tables (as markdown) to the chunk on the same page, or start a new chunk if none matches.
    for table in analyze_result.tables or []:
        table_md = _table_to_markdown(table)
        if not table_md:
            continue
        page_number = _table_page_number(table)
        target = next((c for c in chunks if c.page_number == page_number), None)
        if target is not None and _count_tokens(target.content) + _count_tokens(table_md) <= max_tokens * 1.5:
            target.content = f"{target.content}\n\n{table_md}"
        else:
            chunks.append(
                _Chunk(
                    content=table_md,
                    page_number=page_number,
                    section_heading=f"Table (page {page_number})",
                    chunk_index=chunk_index,
                )
            )
            chunk_index += 1

    return chunks


# --------------------------------------------------------------------------- embedding + indexing


def _batched(items: list[Any], batch_size: int) -> list[list[Any]]:
    return [items[i : i + batch_size] for i in range(0, len(items), batch_size)]


@with_azure_retry()
def _create_embeddings_batch(client, model: str, texts: list[str]):
    return client.embeddings.create(model=model, input=texts)


async def _embed_and_index_chunks(chunks: list[_Chunk], doc: dict[str, Any]) -> None:
    if not chunks:
        return

    settings = get_settings()
    openai_client = get_embedding_client()
    search_client = get_search_client()

    search_docs: list[dict[str, Any]] = []
    total_embedding_tokens = 0
    for batch in _batched(chunks, 16):
        response = _create_embeddings_batch(
            openai_client, settings.azure_openai_embedding_deployment, [c.content for c in batch]
        )
        if response.usage:
            total_embedding_tokens += response.usage.total_tokens
        for chunk, embedding_item in zip(batch, response.data):
            search_docs.append(
                {
                    "id": f"{doc['id']}_{chunk.chunk_index}",
                    "content": chunk.content,
                    "content_vector": embedding_item.embedding,
                    "document_name": doc["document_name"],
                    "page_number": chunk.page_number,
                    "section_heading": chunk.section_heading,
                    "chunk_index": chunk.chunk_index,
                    "document_category": doc["document_category"],
                    "uploaded_by": doc["uploaded_by"],
                    "upload_timestamp": doc["upload_timestamp"],
                }
            )

    for batch in _batched(search_docs, 100):
        search_client.upload_documents(documents=batch)

    if total_embedding_tokens:
        # extract_and_index() already runs as a BackgroundTask (see api/documents.py), so this
        # is off the request path already - no need to schedule a further background task.
        await increment_usage(user_id=doc["uploaded_by"], embedding_tokens=total_embedding_tokens)
