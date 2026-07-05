from types import SimpleNamespace

import pytest

from app.services.ingestion import (
    MAX_UPLOAD_BYTES,
    IngestionError,
    _chunk_analyze_result,
    _extension_of,
    upload_document,
)


def make_paragraph(content, role=None, page=1):
    return SimpleNamespace(content=content, role=role, bounding_regions=[SimpleNamespace(page_number=page)])


def make_analyze_result(paragraphs, tables=None, content=None, pages=None):
    return SimpleNamespace(paragraphs=paragraphs, tables=tables or [], content=content, pages=pages or [])


def test_extension_of_various_filenames():
    assert _extension_of("report.PDF") == "pdf"
    assert _extension_of("scan.PNG") == "png"
    assert _extension_of("noextension") == ""
    assert _extension_of("archive.tar.gz") == "gz"


def test_chunk_analyze_result_splits_on_headings():
    paragraphs = [
        make_paragraph("Introduction", role="sectionHeading", page=1),
        make_paragraph("This is the intro body.", page=1),
        make_paragraph("Details", role="sectionHeading", page=2),
        make_paragraph("This is the details body.", page=2),
    ]
    chunks = _chunk_analyze_result(make_analyze_result(paragraphs))

    assert len(chunks) == 2
    assert chunks[0].section_heading == "Introduction"
    assert "intro body" in chunks[0].content
    assert chunks[0].page_number == 1
    assert chunks[1].section_heading == "Details"
    assert "details body" in chunks[1].content
    assert chunks[1].page_number == 2
    assert [c.chunk_index for c in chunks] == [0, 1]


def test_chunk_analyze_result_skips_boilerplate_roles():
    paragraphs = [
        make_paragraph("Page 1 of 10", role="pageFooter", page=1),
        make_paragraph("Real content here.", page=1),
    ]
    chunks = _chunk_analyze_result(make_analyze_result(paragraphs))
    assert len(chunks) == 1
    assert "Real content here." in chunks[0].content
    assert "Page 1 of 10" not in chunks[0].content


def test_chunk_analyze_result_falls_back_to_raw_content_with_no_paragraph_structure():
    result = make_analyze_result(paragraphs=[], content="Unstructured OCR text blob.")
    chunks = _chunk_analyze_result(result)
    assert len(chunks) == 1
    assert chunks[0].content == "Unstructured OCR text blob."
    assert chunks[0].section_heading == "Document"


def test_chunk_analyze_result_empty_document_produces_no_chunks():
    result = make_analyze_result(paragraphs=[], content=None)
    assert _chunk_analyze_result(result) == []


# --- upload_document() validation paths - these raise before touching Blob Storage, so they're
# safe to exercise without any real Azure connection. ---


async def test_upload_document_rejects_unsupported_extension():
    with pytest.raises(IngestionError, match="Unsupported file type"):
        await upload_document(
            file_bytes=b"data", filename="virus.exe", content_type="application/octet-stream",
            category="general", user_id="u1",
        )


async def test_upload_document_rejects_empty_file():
    with pytest.raises(IngestionError, match="empty"):
        await upload_document(
            file_bytes=b"", filename="doc.pdf", content_type="application/pdf", category="general", user_id="u1",
        )


async def test_upload_document_rejects_oversized_file():
    oversized = b"x" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(IngestionError, match="exceeds maximum"):
        await upload_document(
            file_bytes=oversized, filename="doc.pdf", content_type="application/pdf",
            category="general", user_id="u1",
        )
