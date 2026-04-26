# Server runtime

## Startup flow

- Run database migrations explicitly with `npm run migrate`
- Start the API server with `npm run start`
- Start the background worker separately with `npm run start:worker` only if you want orphan Google Drive cleanup

For local development, use `npm run dev` and `npm run dev:worker` in separate terminals.

## Why this changed

- The API server no longer performs schema-changing DDL on startup
- Background polling workers no longer run inside the web process
- Vector embeddings, local Python AI generation, and internal OCR-specific code were removed from the backend
- Search-heavy endpoints now expose in-memory latency counters at `GET /api/monitoring/search`
