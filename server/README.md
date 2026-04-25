# Server runtime

## Startup flow

- Run database migrations explicitly with `npm run migrate`
- Start the API server with `npm run start`
- Start the background worker separately with `npm run start:worker`

For local development, use `npm run dev` and `npm run dev:worker` in separate terminals.

## Why this changed

- The API server no longer performs schema-changing DDL on startup
- Background polling workers no longer run inside the web process
- Search-heavy endpoints now expose in-memory latency counters at `GET /api/monitoring/search`
