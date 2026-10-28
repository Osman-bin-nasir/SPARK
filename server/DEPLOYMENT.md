# Deploy conversational bots to Render

The local tunnel and local test database are not part of deployment. Production
runs the same intent pipeline against the existing Render backend and PostgreSQL
database. No new API keys, GPU, worker service, or polling process is needed.

## 1. Deploy the PR

Merge the conversational-bot PR and deploy `main` to the existing Docker web service.
The Docker entrypoint runs `npm run migrate` before starting the API. Confirm
`012_bot_conversations` was applied and the new deployment is live. This migration
adds conversation context and an index for sender-owned expense queries; existing
transactions, accounts, links and credentials remain in the production database.
Local demo accounts and expenses are not copied to production.

## 2. Environment

Keep the existing database, JWT, Google, Telegram, Twilio, Groq and OCR secrets.
`server/.env.production.example` contains placeholders and deployment settings.
In Render, verify these values and save/deploy if they change:

```dotenv
NODE_ENV=production
APP_BASE_URL=https://sparkmetrics.online
PUBLIC_API_BASE_URL=https://api.sparkmetrics.online
GOOGLE_REDIRECT_URI=https://api.sparkmetrics.online/api/google-drive/callback
GOOGLE_DRIVE_POST_CONNECT_URL=https://sparkmetrics.online/integrations
AUTOMATION_ENABLED=true
AUTOMATION_RUN_IN_API=true
AUTOMATION_TIME_ZONE=Asia/Kolkata
GROQ_MODEL=openai/gpt-oss-120b
```

Use the existing production `DATABASE_URL`, never the laptop's `127.0.0.1:55432`
database. Leave `PORT` to Render. Production startup rejects localhost frontend/API
origins and temporary Cloudflare origins to avoid generating unusable login links.
The frontend must use `VITE_API_BASE_URL=https://api.sparkmetrics.online/api`.

## 3. Switch Telegram after deployment

Confirm the new release is live and `/health` on `https://api.sparkmetrics.online`
returns 200. From `server` on a machine with the existing bot credentials and the
same webhook secret as Render, run in PowerShell:

```powershell
$env:PUBLIC_API_BASE_URL='https://api.sparkmetrics.online'
node src/scripts/automation.js setup --apply-telegram
```

This verifies unsigned requests are rejected and the signed secret matches before
registering `https://api.sparkmetrics.online/api/webhooks/telegram`. It preserves
pending Telegram updates. The bot has one webhook: switching it stops delivery to
the laptop. Do not run this command until the new production release is deployed.

## 4. WhatsApp

In Twilio, set **When a message comes in** to
`https://api.sparkmetrics.online/api/webhooks/whatsapp`, method **POST**, and save.
Environment changes alone do not update Twilio's registered webhook. Sandbox
participants must still join the sandbox. Existing production URLs need no change.

## 5. Verify

Use a linked production account and ask for this month's spending first, then
"What about last month?". Compare against that sender's attributed transactions,
not the entire team's ledger. Test an explicitly marked small expense only if
desired; queries do not create records. Test both channels. Inspect queue status
and Render logs if delivery fails; do not log prompts, tokens or financial payloads.
The model needs the existing Groq quota; 429 and temporary outages use the existing
durable queue's bounded retries and provider cooldowns.

Context survives restarts in PostgreSQL and expires for lookup after 30 minutes.
Queries include pending review, exclude duplicates and income, and show amounts as
recorded (there is no per-record currency field). Bot edits/deletes are disabled.
Receipt images/PDFs retain their existing Google Drive and OCR requirements.

If the new release fails, redeploy the previous working release. Keep the additive
migration and database records; no database rollback or data deletion is necessary.
