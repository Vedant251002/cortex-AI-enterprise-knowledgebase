# Cortex: AI Enterprise Knowledge Assistant

## What is this?

Cortex is a full-stack Retrieval-Augmented Generation (RAG) application that lets employees
upload internal documents — policies, financial reports, engineering specs, HR material — and
ask natural-language questions against them. Every answer is grounded in, and cited to, the
actual source content, so users get trustworthy answers instead of hallucinated ones.

## Why this project

Enterprises sit on large volumes of internal knowledge scattered across PDFs, Word docs, and
scanned files that employees can't easily search or ask questions of. Generic AI chatbots either
don't have access to this private data or, if given naive access, ignore who's allowed to see
what. Cortex solves both problems at once: it makes internal knowledge conversational, while
enforcing role-based access so people only ever get answers grounded in documents they're
actually authorized to see — with every action logged for accountability.

## What it delivers

- **Conversational search over private documents** — upload a file and chat with it in plain
  English, with every answer citing the exact source passages it came from.
- **Role-based access control (RBAC)** — three roles (`admin`, `analyst`, `viewer`), each scoped
  to specific document categories, enforced independently at the API layer, the search/retrieval
  layer, and the UI — so restricted content never even reaches the AI model for an unauthorized
  user.
- **Append-only audit trail** — every login, upload, deletion, chat query, access denial, and
  admin action is permanently logged for compliance and traceability.
- **Per-user usage & cost tracking** — token consumption is tracked per user, per day, with
  configurable cost-per-token rates and daily quotas, so AI spend stays visible and controllable.
- **Production-oriented engineering** — built end-to-end on Azure (OpenAI, AI Search, Document
  Intelligence, Blob Storage, Cosmos DB, Content Safety, Key Vault), containerized with Docker,
  covered by an automated test suite, and wired into a CI pipeline.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (async), Pydantic v2, Python |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| AI | Azure OpenAI (chat + embeddings), Azure AI Search (hybrid retrieval) |
| Document processing | Azure AI Document Intelligence (OCR + layout extraction) |
| Data | Azure Blob Storage, Azure Cosmos DB |
| Safety & Ops | Azure AI Content Safety, Azure Key Vault, Application Insights |

For a full technical deep-dive — architecture diagram, RBAC/audit/usage internals, Azure
provisioning steps, API reference, setup instructions, and known limitations — see
[`docs/architecture.md`](docs/architecture.md).
