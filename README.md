# SPARK (Financial Operations Platform)

SPARK is a startup-focused financial operations platform designed to replace spreadsheet-heavy expense tracking with a lightweight, intelligent workflow. It combines Telegram and WhatsApp document intake, AI-assisted extraction, duplicate prevention, approval governance, semantic search, founder-facing dashboards, and Google Sheets synchronization.

---

## System Architecture

The application is structured as a decoupled, multi-container system:
* **React Web App**: Built with Vite, Tailwind CSS, and Recharts, exposing modular interfaces for financial tracking, approvals, analytics, and service integrations.
* **Express API Server**: Serves as the central API gateway and business logic engine, utilizing role-aware organization middleware, JWT security, and cryptographically secure tokens.
* **PostgreSQL Database**: Run via Neon, utilising `pgvector` for high-dimensional semantic search and structured transaction tables.
* **Background Worker Service**: Runs asynchronous loops to process document embedding queues and clean up orphaned Google Drive files.
* **Intake Bot Webhooks**: Ingestion points for Telegram and WhatsApp bots configured via signed request validation.

---

## Implemented Features & Core Workflows

### 1. Ingestion Pipelines (Telegram & WhatsApp Bots for now will add more platforms)
* **Telegram Intake**: Receives documents, PDFs, or raw message texts. Associates them with organizations via temporary join codes and links Telegram accounts to user IDs.
* **WhatsApp Business Integration**: Implements signature-verified webhook endpoints matching WhatsApp webhook payloads. Fully manages:
  * **Login Tokens**: `whatsapp_login_tokens` are generated and consumed to securely link user accounts.
  * **Join Intents**: `whatsapp_join_intents` persist invitations and allow new team members to join organizations using invite tokens.
* **Google Drive Archival**: Multi-modal uploads are automatically uploaded and organized in secure, folder-structured storage buckets via OAuth2.

### 2. Transaction Auditing & Duplicate Prevention
* **Ledger Auditing**: Manual or automated transactions log detailed parameters including amount, vendor, category, date, and confidence levels.
* **Audit Logs**: Changes to ledger data write to `audit_logs` capturing previous and new JSON values for comprehensive audit trails.
* **Double-Entry Prevention**:
  * **Heuristic Matching**: Prevents duplicates by flagging transactions with identical values, types, and amounts within a ±7-day window.
  * **Hash Deduplication**: Matches SHA-256 hashes of incoming document attachments against database records.

### 3. Financial Intelligence & Dashboard Analytics
* **Runway & Burn Tracker**: Calculates monthly cash burn averages and projects the exact cash runway (in months) and estimated depletion dates.
* **Budget Allocations**: Category budgets check monthly limits, raising `warning` alerts at 80% usage and `exceeded` alerts at 100%.
* **Spike Alerts**: Flags suspicious expense increases exceeding $500 and 1.5x of the 3-month category average.
* **Performance Analysis**: Processes monthly and category-level net returns, salaries/payroll, total outlays, and performance ratios.

### 4. Semantic Search & Grounded RAG
* **pgvector Database Search**: Integrates 384-dimensional cosine similarity searches utilizing an `ivfflat` database index to look up transaction items and extracted document texts.
* **RAG Search Planner**: High-level planner routes natural language queries (e.g. *"how much did we spend on software in March?"*) to execute lookups, summaries, comparisons, or vector similarity queries. Returns a grounded answer complete with stats and citations.
* **Embedding Queue**: The background worker claims pending transaction embeddings and calculates vectors asynchronously to prevent API bottlenecks.

### 5. Dynamic Google Sheets Mirroring
* **Automatic Synchronization**: Mirror transactions into an organization-owned workbook `SPARK Transactions - [Org Name]`.
* **Multi-Window Tabs**: Divides transaction lists dynamically into time-range tabs: **1M**, **3M**, **6M**, and **12M**.
* **Visual Formatting**: Standardizes sheet styling by freezing header rows, applying colors, and setting up basic filters before sharing editing permissions with organization members.

### 6. Approval & Month-Close Workflows
* **Governance Queue**: High-value or low-confidence transactions route to a review queue requiring explicit approval.
* **Approval Records**: Successful reviews write to `approvals` linking the target transaction with the authorising user ID and timestamp.

---

## Database Schema (Neon PostgreSQL)

### Database Schema Map
```mermaid
erDiagram
    users ||--o{ organization_members : belongs_to
    users ||--o{ google_integrations : owns
    users ||--o{ approvals : approves
    users ||--o{ audit_logs : logs
    organizations ||--o{ organization_members : contains
    organizations ||--o{ google_integrations : configures
    organizations ||--o{ finance_settings : configures
    organizations ||--o{ category_budgets : defines
    organizations ||--o{ transactions : records
    transactions ||--o{ documents : has
    transactions ||--o| transaction_embeddings : has
    transactions ||--o| approvals : has
    transactions ||--o{ audit_logs : logs
```

### Table Dictionary

#### 1. Core Platform Tables
* **`users`**: Platform accounts containing cryptographically hashed credentials and linking fields.
  * Fields: `id` (UUID), `email` (TEXT), `first_name` (TEXT), `password_hash` (TEXT), `telegram_id` (BIGINT), `whatsapp_id` (BIGINT), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ)
* **`organizations`**: Business units.
  * Fields: `id` (UUID), `name` (TEXT), `join_code` (TEXT), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ)
* **`organization_members`**: Link table mapping roles inside organizations.
  * Fields: `id` (UUID), `organization_id` (UUID), `user_id` (UUID), `role` (founder, admin, member), `created_at` (TIMESTAMPTZ)

#### 2. Ingestion & Bot Integration Tables
* **`telegram_join_intents` / `whatsapp_join_intents`**: Track bot invitations to organizations.
  * Fields: `telegram_id`/`whatsapp_id` (BIGINT), `organization_id` (UUID), `join_code` (TEXT), `expires_at` (TIMESTAMPTZ)
* **`telegram_login_tokens` / `whatsapp_login_tokens`**: Short-lived verification tokens for bot login links.
  * Fields: `token` (UUID), `telegram_id`/`whatsapp_id` (BIGINT), `expires_at` (TIMESTAMPTZ), `used_at` (TIMESTAMPTZ)
* **`ingestion_jobs`**: Tracker for bot text/document ingestion.
  * Fields: `id` (UUID), `organization_id` (UUID), `source` (telegram, whatsapp, text), `file_name` (TEXT), `status` (processing, completed, failed)
* **`orphan_drive_files`**: Google Drive files marked for background deletion if their transaction context fails.
  * Fields: `id` (UUID), `organization_id` (UUID), `drive_file_id` (TEXT), `cleanup_status` (pending, deleted, failed)

#### 3. Transactions & Documents
* **`transactions`**: Ledger entries.
  * Fields: `id` (UUID), `organization_id` (UUID), `amount` (NUMERIC), `vendor` (TEXT), `transaction_type` (expense, income, salary), `category` (TEXT), `transaction_date` (DATE), `confidence_score` (NUMERIC), `duplicate_of_transaction_id` (UUID), `duplicate_score` (NUMERIC), `status` (auto_verified, pending_review)
* **`documents`**: Bot uploads or custom files attached to transactions.
  * Fields: `id` (UUID), `transaction_id` (UUID), `organization_id` (UUID), `storage_kind` (google_drive, inline_text), `drive_file_id` (TEXT), `drive_folder_id` (TEXT), `original_name` (TEXT), `stored_name` (TEXT), `file_type` (TEXT), `content_hash` (CHAR(64)), `text_content` (TEXT), `extracted_text` (TEXT), `extraction_confidence` (NUMERIC), `extraction_method` (TEXT)

#### 4. Analytics, Budgets & Embeddings
* **`finance_settings`**: Stores cash balances.
  * Fields: `organization_id` (UUID), `opening_cash_balance` (NUMERIC), `opening_cash_effective_date` (DATE)
* **`category_budgets`**: Expense limits.
  * Fields: `id` (UUID), `organization_id` (UUID), `category` (TEXT), `normalized_category` (TEXT), `monthly_limit` (NUMERIC)
* **`transaction_embeddings`**: Text embeddings.
  * Fields: `transaction_id` (UUID), `embedding` (VECTOR(384)), `created_at` (TIMESTAMPTZ)
* **`embedding_jobs`**: Asynchronous worker processing queue.
  * Fields: `id` (UUID), `transaction_id` (UUID), `organization_id` (UUID), `status` (pending, processing, completed, failed), `attempt_count` (INT)

#### 5. Audit & Governance
* **`approvals`**: Explicit audits of reviewed transactions.
  * Fields: `id` (UUID), `transaction_id` (UUID), `approved_by` (UUID), `approved_at` (TIMESTAMPTZ)
* **`audit_logs`**: Logs for modifications.
  * Fields: `id` (UUID), `user_id` (UUID), `transaction_id` (UUID), `action` (TEXT), `previous_value` (JSONB), `new_value` (JSONB), `timestamp` (TIMESTAMPTZ)

---

## API Routing Guide

All API endpoints are prefixed with `/api`. Protected routes require a valid JWT header (`Authorization: Bearer <token>`) and organization-scoped routes require `X-Organization-Id` in headers.

### Authentication (`/api/auth`)
* `POST /signup` — Register email, first_name, and password. Creates a default organization.
* `POST /login` — Logs in with email/password; returns access and refresh JWTs.
* `POST /refresh-token` — Regenerate access tokens using refresh tokens.
* `POST /verify` — Check validity of the current access token.
* `POST /telegram/token` — Consumes a Telegram login token and links the account.
* `POST /whatsapp/token` — Consumes a WhatsApp login token and links the account.

### Dashboard & Analytics (`/api/dashboard`)
* `GET /` — Fetches burn metrics, cash on hand, trends, top vendors, and budget/spike alerts.
* `GET /config` — Retrieves finance settings (opening balance, date).
* `POST /config` — Configures or updates finance settings.
* `GET /budgets` — Lists active category budget thresholds.
* `POST /budgets` — Replaces budget configuration array.

### Google Drive Integration (`/api/google-drive`)
* `GET /auth-url` — Generates a Google consent screen OAuth redirection URL.
* `POST /callback` — Exchanges authorization codes for encrypted tokens and saves drive references.
* `GET /status` — Returns Google connection status (connected, account email, folder ID).
* `POST /disconnect` — Revokes Google Drive integration and clears credentials.

### Document Ingestion (`/api/ingestion`)
* `POST /whatsapp` — Webhook for WhatsApp bot uploads. Requires raw payload signature validation.
* `POST /telegram` — Webhook for Telegram bot uploads.
* `POST /document` — Endpoint for external processing services to upload structured documents.
* `POST /text` — Endpoint for text-based expense notes.

### Transactions Ledger (`/api/transactions`)
* `GET /` — Paginated transactions filter (type, status, vendor, dates).
* `POST /` — Manually insert transactions.
* `GET /:id` — Details of a specific transaction, including audit history.
* `PATCH /:id` — Updates transaction fields; logs old values to audits.
* `DELETE /:id` — Deletes transaction entries and marks attachments for worker cleanup.
* `GET /google-sheets` — Syncs transactions to Google Sheets; returns URL and sheet details.
* `POST /:id/approve` — Approves a transaction, transitioning status to `approved`.
* `DELETE /:id/approve` — Reverts approvals.

### Grounded RAG Search (`/api/rag`)
* `POST /query` — Routes plain text questions to search planner to calculate summaries, comparisons, or vector matches.

---

## Local Installation

### Prerequisites
* **Node.js**: v20 or higher
* **Docker**: Required for local multi-container environments
* **PostgreSQL**: Neon account (or local database instance supporting `pgvector`)

### Setup Instructions

1. **Clone & Install**:
   ```bash
   # Clone the repository
   git clone https://github.com/Osman-bin-nasir/SPARK.git
   cd SPARK
   
   # Install backend dependencies
   cd server && npm install
   
   # Install frontend dependencies
   cd ../client && npm install
   ```

2. **Configure Environment**:
   Create a `server/.env` file in the backend directory:
   ```env
   PORT=4000
   DATABASE_URL=postgresql://neondb_owner:npg_c7djQ5BAInxr@ep-snowy-lab-annge9mw.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require
   JWT_SECRET=your_jwt_secret_key
   REFRESH_JWT_SECRET=your_refresh_secret_key
   TELEGRAM_JWT_SECRET=your_telegram_secret_key
   APP_BASE_URL=https://sparkmetrics.online
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=https://spark-y1r2.onrender.com/api/google-drive/callback
   GOOGLE_TOKEN_ENCRYPTION_KEY=bd976af87fc67d9e4cf268905a98f9d8c333b564d1dd7bba6a4a781d66b0e46d
   WEBHOOK_SECRET=your_webhook_validation_secret
   ```

3. **Database Setup**:
   ```bash
   cd server
   # Run database migrations
   npm run migrate
   # Seed realistic transaction datasets for dashboards
   npm run seed
   ```

4. **Running Locally**:
   ```bash
   # Run Backend (Server + Embeddings Queue Worker)
   cd server
   npm run dev
   
   # Run Frontend (Vite server)
   cd ../client
   npm run dev
   ```

### Running with Docker Compose
To spin up the entire multi-container service environment locally:
```bash
docker compose up --build
```

---

## AWS Deployment Configuration

The backend is configured for automated CI/CD and deployment to **AWS Elastic Beanstalk (Docker Platform)**:

### 1. Production Dockerfile
The project utilizes a simplified backend [Dockerfile](./Dockerfile) built on `node:20-alpine`:
* Proper signal handling implemented via `dumb-init`.
* Runs as a secure non-root `nodejs` container user.
* Exposes port `4000`.
* Embeds a container `HEALTHCHECK` pointing to `/health`.
* Runs automatic migration scripts prior to starting the Express server.

### 2. GitHub Actions Deployment
The workflow [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) triggers automated deployments on pushes to `main`:
1. Zips project source code, Docker configs, and dependencies.
2. Deploys using the `einaregilsson/beanstalk-deploy` action.
3. Automatically maps AWS environment variables.
4. Uses `use_existing_version_if_available: true` to handle workflow reruns safely.

### 3. DNS and HTTPS Setup
* **ACM SSL Certs**: SSL termination is handled by AWS Certificate Manager (ACM) by binding a public SSL certificate (for `api.sparkmetrics.online`) directly to an HTTPS listener on port 443 of the Elastic Beanstalk load balancer.
* **CNAME records**: Custom subdomain `api.sparkmetrics.online` points via a CNAME record directly to the Elastic Beanstalk endpoint:
  * Target: `spark-backend-env.eba-ggwipqh2.us-east-1.elasticbeanstalk.com`
