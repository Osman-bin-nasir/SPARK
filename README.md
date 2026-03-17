# SPARK

SPARK is a startup-focused financial operations platform designed to replace spreadsheet-heavy expense tracking with a lightweight, intelligent workflow. The target product combines Telegram-based document intake, AI-assisted extraction, duplicate prevention, approval governance, semantic search, and founder-facing dashboards so early-stage teams can manage burn, runway, and expense controls without enterprise accounting software.

This README documents both the product plan and the current repository status as of March 17, 2026.

## Problem Statement

Early-stage startups often manage finances with spreadsheets, message threads, and ad hoc tools instead of dedicated finance software or accounting teams. That creates several risks:

- Poor visibility into burn rate, runway, and category-level spending
- Duplicate payments and inconsistent expense records
- Manual invoice and receipt entry that increases human error
- Weak approval controls for high-value transactions
- Little transparency when financial data is edited after submission

SPARK aims to solve this with a lightweight finance system built for startup teams:

- Telegram-first intake for receipts, invoices, and text submissions
- AI-assisted extraction and categorization
- Duplicate detection and review workflows
- Semantic search across historical expenses
- Founder-friendly dashboards for burn, budgets, and cash visibility
- Governance controls such as approvals, audit logs, and month close

## Target System Flow

### 1. Multi-Modal Input

Users submit finance data through a Telegram bot as:

- Images of receipts
- PDF invoices
- Manual or forwarded text

### 2. AI + OCR + RAG Processing

Each submission is expected to flow through:

1. OCR or text extraction
2. AI processing
3. Structured field extraction

Target extracted fields:

- Amount
- Date
- Vendor
- Category
- Full text
- Confidence score

### 3. Confidence and Review Logic

- If confidence is at least 80%, the transaction should be stored automatically.
- If confidence is below 80%, the transaction should move to a manual review panel for founder or manager verification.
- Direct spreadsheet editing should be avoided to preserve data integrity.

### 4. Storage Architecture

- Google Drive for raw uploaded files
- Google Sheets for a structured transaction mirror
- Neon PostgreSQL as the primary source of truth

Target PostgreSQL responsibilities:

- Transactions
- Documents
- Embeddings for retrieval
- Audit logs
- Approval records
- Version history

### 5. Retrieval-Augmented Intelligence

The planned RAG layer should support:

- Semantic expense search
- Duplicate detection on upload
- Smart auto-categorization from similar historical transactions
- Historical document intelligence and recurring vendor understanding

### 6. Collaboration and Governance

The full product is intended to include:

- Shared founder dashboard
- Approval rules for high-value transactions
- Transparent edit history
- Rollback to previous transaction versions with approval
- Activity feed for adds, edits, approvals, duplicates, and alerts
- Month close workflow that locks closed periods

### 7. Finance Dashboard

Target dashboard modules:

- Monthly burn rate
- Cash runway
- Cash on hand
- Revenue
- Monthly expense trend
- Category breakdown
- Top vendors
- Budget alerts
- Expense spike detection

## Planned Tech Stack

| Area | Target Stack | Current Repo Status |
| --- | --- | --- |
| Frontend | React + Tailwind CSS + Recharts + Socket.IO Client | React + Vite app exists; Tailwind is installed; Recharts and Socket.IO client are not present |
| Backend | Node.js + Express.js + Socket.IO + Python (FastAPI) | Node.js + Express.js backend exists; Socket.IO and Python/FastAPI service are not present |
| Bot | n8n + Python Telegram Bot API | Implemented and tested through the external n8n/Python workflow; not fully versioned in this repository |
| Security | JWT access/refresh, CORS, bcrypt, OAuth, Helmet, Rate Limiting | JWT, refresh-token backend, CORS, bcrypt, and Google OAuth are present; Helmet and rate limiting are not implemented |
| Database | Neon PostgreSQL (pgvector) + Google Drive API | PostgreSQL schema and pgvector support exist; Google Drive integration exists; Google Sheets mirror is not implemented |
| OCR | PaddleOCR | Implemented and tested in the external ingestion workflow; not fully represented in this repository |
| AI / RAG | Sentence Transformers + pgvector | Embedding worker and vector storage exist; Sentence Transformers, semantic search API, and RAG answers are not implemented |
| DevOps | Docker, Docker Compose, Vercel, Railway, GitHub Actions | `client/vercel.json` exists; Docker, Compose, Railway config, and GitHub Actions are not present |
| Version Control | GitHub | In use |

## Current Implementation Snapshot

### What Is Complete

- [x] React frontend shell with login, signup, Telegram login-link consumption, a basic dashboard shell, and an integrations page
- [x] Express backend with mounted route groups for auth, Google Drive, ingestion, and transactions
- [x] Telegram bot implementation with n8n integration, connected and tested outside this repository
- [x] OCR pipeline for receipts and PDFs, connected and tested in the ingestion workflow
- [x] Email/password authentication with bcrypt hashing
- [x] JWT access token issuance
- [x] JWT refresh token backend support
- [x] Telegram account linking flow on the backend
- [x] Automatic default organization creation for new users
- [x] Role-aware organization middleware for protected APIs
- [x] Google Drive OAuth backend flow and integration status endpoint
- [x] Signed webhook ingestion endpoints for document and text submissions
- [x] PostgreSQL schema for users, organizations, transactions, documents, embeddings, ingestion jobs, orphan file cleanup, audit logs, and approvals
- [x] Background worker loop for embedding jobs
- [x] Background worker loop for orphan Google Drive file cleanup
- [x] Transaction list, detail, and update APIs on the backend
- [x] Audit log creation when transactions are created or updated

### What Is Partially Complete

- Partial: Google Drive integration
  - Backend OAuth and status support exist.
  - Frontend has a basic integrations screen.
  - The overall connection flow still needs production-ready frontend handling and broader org-aware UX.

- Partial: Ingestion pipeline
  - The backend accepts signed text and multipart document submissions.
  - Uploaded documents can be stored in Google Drive and transactions are persisted in PostgreSQL.
  - OCR is now connected and tested through the external workflow.
  - AI extraction and structured field generation are still not fully implemented in this repository; the current ingestion endpoints expect already-structured payload fields.

- Partial: Duplicate detection
  - The backend flags potential duplicates during ingestion.
  - Current logic is heuristic and based on amount, vendor, type, and date proximity.
  - Embedding-similarity duplicate detection is not implemented.

- Partial: Embeddings foundation
  - pgvector tables exist and background jobs write embeddings.
  - The current embedding client can call an external provider or fall back to deterministic local vectors.
  - Semantic search, RAG query APIs, and user-facing AI answers are not implemented.

- Partial: Frontend finance modules
  - Placeholder files exist for transactions, approvals, budgets, month close, and activity feed.
  - Those screens and API clients are currently empty and not routed into the app.

- Partial: Governance foundation
  - `audit_logs` and `approvals` tables exist.
  - Transaction updates create audit entries.
  - Approval workflows, edit review UI, rollback flows, and version browsing are not implemented.

### What Still Needs To Be Built

#### Core Product Features

- [ ] AI extraction layer for amount, date, vendor, category, text, and confidence scoring
- [ ] Confidence-threshold routing to manual review
- [ ] Manual review panel for low-confidence or flagged entries
- [ ] Founder approval workflow for high-value transactions such as amounts over $10,000
- [ ] Shared dashboard experience for founders and co-founders
- [ ] Month close and locked-period workflow
- [ ] Google Sheets transaction mirror

#### AI / RAG Features

- [ ] Semantic expense search endpoint and UI
- [ ] RAG answers over historical transaction data
- [ ] Embedding-similarity duplicate detection
- [ ] Auto-categorization from historical transactions
- [ ] Recurring vendor and pending-payment intelligence

#### Finance Dashboard

- [ ] Burn rate metrics
- [ ] Cash runway metrics
- [ ] Cash on hand view
- [ ] Revenue tracking
- [ ] Expense trend charts
- [ ] Category breakdown charts
- [ ] Top vendor views
- [ ] Budget monitoring and alerts
- [ ] Expense spike detection

#### Governance and Transparency

- [ ] Approval request creation and resolution APIs
- [ ] Approval queue UI
- [ ] Activity feed
- [ ] Full transaction version history
- [ ] Git-style rollback workflow with approval
- [ ] Edit locks for closed periods

#### Frontend Productization

- [ ] Transaction list page
- [ ] Transaction detail page
- [ ] Transaction editing UX for allowed roles
- [ ] Review queue and approval screens
- [ ] Budget page
- [ ] Month close page
- [ ] Activity feed page
- [ ] Recharts-based dashboard visualizations
- [ ] Realtime updates with Socket.IO client
- [ ] Organization switcher and richer multi-organization UX

#### Backend / Platform Work

- [ ] Approval service and routes
- [ ] Dashboard metrics APIs
- [ ] Budget monitoring APIs
- [ ] Month close APIs
- [ ] Activity feed APIs
- [ ] Semantic search APIs
- [ ] Socket.IO server integration
- [ ] Python/FastAPI AI service
- [ ] Google Sheets sync service
- [ ] Helmet middleware
- [ ] Rate limiting
- [ ] Docker and Docker Compose setup
- [ ] GitHub Actions CI/CD
- [ ] Railway and full deployment automation

## Current Repo Reality Check

The current repository is best described as a strong backend foundation plus an early frontend shell.

Today, the live app surface is limited to:

- Auth screens
- Telegram link completion flow
- A basic dashboard card
- A Google Drive integrations page

The live backend currently exposes:

- `/api/auth`
- `/api/google-drive`
- `/api/ingestion`
- `/api/transactions`

Important notes:

- The repository contains empty placeholder frontend files for approvals, budgets, month close, transactions, and activity feed.
- The repository also contains an older empty `server/src/api` tree that is not the active backend route surface.
- Google Sheets and Telegram client files exist only as empty placeholders.
- The Telegram bot and OCR flow are working through your external n8n-connected setup, but that implementation is not fully captured in this repository.
- There is no Python service directory, no Docker setup, and no CI workflow in the repo today.

## Team Roles

- Osman: Telegram bot (`n8n + Python`), file ingestion pipeline, PaddleOCR implementation, Neon PostgreSQL schema design, pgvector setup, Google Drive storage integration, Socket.IO integration, selected frontend components
- Saif: AI / RAG, PaddleOCR integration support, embeddings, pgvector similarity search, duplicate detection, auto-categorization, confidence scoring, LLM integration
- Razzaq: Main frontend and backend, React dashboard UI, Tailwind styling, charts, Express APIs, authentication, approval workflows, audit logs, realtime events, business logic implementation

## Suggested Build Order

1. Build structured extraction, confidence scoring, and review routing on top of the working bot-to-backend OCR ingestion path.
2. Add transaction listing, detail, and review UI on the frontend.
3. Implement approval workflows and activity feed APIs plus screens.
4. Build dashboard metrics and Recharts visualizations.
5. Add semantic search and RAG endpoints on top of stored embeddings.
6. Introduce realtime updates with Socket.IO.
7. Add deployment, CI, rate limiting, and security hardening.

## Repository Structure

```text
SPARK/
  client/   React frontend
  server/   Express backend and PostgreSQL integration
```

Planned but not yet present as first-class directories:

- `bot/`
- `ai-service/`
- `.github/workflows/`
- Docker deployment files

## Running the Current Repo Locally

### Frontend

```bash
cd client
npm install
npm run dev
```

### Backend

```bash
cd server
npm install
npm run dev
```

Minimum backend environment variables currently required:

- `DATABASE_URL`
- `JWT_SECRET`

Additional variables are required for specific features:

- Google Drive OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`
- Signed ingestion webhooks: `WEBHOOK_SECRET`
- External embedding provider: `EMBEDDING_API_URL` and optional `EMBEDDING_API_KEY`

## Summary

The planned SPARK product is a Telegram-first, AI-assisted startup finance platform with RAG, governance, and founder dashboards. The current repository already includes meaningful backend building blocks such as auth, organizations, ingestion endpoints, Google Drive storage, transaction APIs, embeddings infrastructure, and audit logging, and your Telegram bot plus OCR flow are already connected and tested externally. The biggest remaining work is the AI extraction layer, the dashboard product surface, approvals and review workflows, semantic search, and deployment hardening.
