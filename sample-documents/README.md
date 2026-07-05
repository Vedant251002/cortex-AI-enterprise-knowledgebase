# Sample Documents

This folder holds demo/test content for the ingestion pipeline (upload -> Blob -> Document
Intelligence -> chunking -> embeddings -> Azure AI Search), covering all 5 RBAC categories
(recall: `admin` sees all 5, `analyst` sees `general`+`finance`, `viewer` sees `general` only).

All content below is **fictional** — a synthetic company ("Atlantic Fictus Corp") and invented
figures, policies, and incidents. Nothing here is real confidential or production data.

## What's here

| Category | File | Format | Exercises |
|---|---|---|---|
| `general` | `remote-work-policy.docx` | DOCX | Office document parsing |
| `general` | `sample-general-policy.txt` | TXT | Plain-text baseline (same content, kept for quick manual testing) |
| `finance` | `q4-budget-memo.pdf` | PDF | Native PDF text + layout extraction |
| `finance` | `sample-finance-report.pdf` | PDF | PDF with an embedded markdown-style table |
| `finance` | `sample-finance-report.txt` | TXT | Plain-text baseline (same content as the PDF above) |
| `hr` | `hr-onboarding-checklist-scan.png` | PNG (scanned image) | OCR path in `prebuilt-layout` — this file has no embedded text layer |
| `legal` | `sample-legal-policy.txt` | TXT | Data retention / confidentiality policy content |
| `engineering` | `sample-engineering-runbook.txt` | TXT | Incident-response runbook content |

Every supported upload type (PDF, DOCX, scanned image, plain text) and all 5 categories are
represented, so the full RBAC matrix and both extraction paths (native text vs. OCR) can be
demoed end-to-end.

## Suggested demo script

1. Log in as **admin**, upload `q4-budget-memo.pdf` tagged `finance`. Confirm the audit trail
   records the upload with the correct user/document/category.
2. Log in as **analyst** (has `finance` access), ask about the Q4 budget. Confirm the answer is
   cited and "My Usage" reflects the token spend.
3. Log in as **viewer** (`general` only), ask the same question. Confirm the system responds
   "I don't have enough information" — proof the `finance` chunks were filtered out of retrieval.
4. Log in as **admin**, upload `hr-onboarding-checklist-scan.png` tagged `hr` to demonstrate the
   OCR path, then upload one of the `legal`/`engineering` `.txt` files to show all 5 categories
   populated in the Document Library.

**Do not put real confidential or production documents in this folder** — it is intended purely
for fictional/synthetic demo content that is safe to commit to source control.
