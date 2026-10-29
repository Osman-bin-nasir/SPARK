# Deploy conversational bots to Render

## Security rollout (migration 013)

Generate unique random signing keys before starting either API or worker. Blank
keys, known example strings, and production keys shorter than 32 characters fail
startup. Copying an env example alone is intentionally insufficient, including
local development. Generate values locally and paste the output into your env:

```sh
node -e "const c=require('crypto');for(const k of ['JWT_SECRET','REFRESH_JWT_SECRET','TELEGRAM_JWT_SECRET','WEBHOOK_SECRET','TELEGRAM_WEBHOOK_SECRET'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
```

Keep existing strong keys; rotate exposed, blank or example keys and coordinate
WEBHOOK_SECRET changes with trusted legacy callers. Never commit generated values.
When Telegram is enabled its webhook secret must also be non-empty and at least
32 characters. Coordinate a rotation with Render and `automation setup --apply-telegram`
after deployment so Telegram and the API use the same value.
Run migration `013_secure_sessions` before starting the API. Existing stateless
refresh tokens stop working: users must sign in again. Browser access tokens are
memory-only; refresh credentials use a Secure, HttpOnly, host-only SameSite=Lax
cookie (non-Secure localhost cookie only in explicit development mode). API clients
receive an opaque refresh token in JSON; `/auth/refresh` rotates it and `/auth/logout`
revokes its family. Reusing a consumed token revokes the family and its associated
access tokens. Both browser endpoints require `X-Spark-Browser-Session: 1` when a
session cookie is present. CORS allows credentials only from configured app origins.
Use HTTPS and a same-site frontend/API, or the same-origin `/api` proxy. Preview
origins need their own explicitly configured backend; do not wildcard CORS.

The API verifies session-family status on authenticated browser requests; no idle
polling was added. Logout reports revocation failures instead of claiming success.
Access tokens issued by older releases expire normally; rotate the JWT key if an
immediate forced logout of pre-migration sessions is needed. Refresh history is
kept through expiry to detect replay; existing daily maintenance removes at most
500 rows expired for an extra seven days, using the expiry index. No extra polling
timer or service was added.

SPARK-generated workbook sharing is restricted to current workspace members and
the active integration owner's Google account. Synchronization reconciles legacy
direct/nonmember shares before publishing new financial data. Member removal
revokes that member's direct workbook grants before committing, and uses the same
workspace lock as sharing to prevent stale jobs from restoring access. Google
owners and inherited access cannot be silently revoked: transfer/reconnect the
integration or remove parent sharing first. Removal fails if revocation fails.
Audit existing Drive ownership/parent sharing during rollout; copies/downloads of
previously shared files cannot be recalled by software. Only SPARK's known generated
workbook is reconciled; unrelated Drive files are not modified.

CSP is enabled in both the API's static host and Vercel. Inline styles remain
allowed for the existing React UI; inline scripts and arbitrary script hosts are
blocked. Registration/login throttling counts successful requests too. Refresh
and logout have a separate rate bucket so failed login attempts do not consume
their budget.

The local tunnel and local test database are not part of deployment. Production
runs the same intent pipeline against the existing Render backend and PostgreSQL
database. No new API keys, GPU, worker service, or polling process is needed.
Docker, CI and the package engines use Node.js 24 LTS. Use Node.js 24 locally and
select Node.js 24 for frontend hosting to support the current build/lint tools.

Browser API access is limited to `APP_BASE_URL`, its `www`/apex counterpart, and
`PUBLIC_API_BASE_URL` (plus local development origins in explicit development
mode). Render's single ingress is trusted only when `RENDER=true`; authentication
attempts are throttled per IP. Render sets `RENDER=true` for its single ingress.
For other Docker reverse-proxy deployments, set `TRUST_PROXY_HOPS` to the exact
number of trusted proxies in front of Express; do not set it to `true` or trust
arbitrary forwarded chains. A directly exposed Docker container should leave the
setting unset.
Legacy `/api/auth/telegram`, `/whatsapp`, `/create-telegram-login` and
`/create-whatsapp-login` require `X-Spark-Signature: sha256=HEX_HMAC` over the exact
JSON body using `WEBHOOK_SECRET`. Native provider webhooks and bot account linking
continue to use their existing verification. Never give that signing secret to
the frontend. Access logs omit URL query parameters; server errors omit internals.
Only founders/co-founders can change member roles, including through the generic
member update route; admins can still update report-recipient preferences.
Pending invitations from older releases with custom or founder roles remain
usable, but acceptance safely downgrades those legacy roles to `member`; resend
an invite with a supported role if a different role is intended.
PostgreSQL TLS verifies the server certificate and hostname (`verify-full`). Keep
`DATABASE_SSL=true` for hosted databases; local Compose explicitly disables TLS
for its internal PostgreSQL service. Do not disable TLS to bypass certificate errors.

## 1. Deploy the PR

Merge the conversational-bot PR and deploy `main` to the existing Docker web service.
The Docker entrypoint runs `npm run migrate` before starting the API. Confirm
`012_bot_conversations` was applied and the new deployment is live. This migration
adds conversation context and an index for sender-owned expense queries; existing
transactions, accounts, links and credentials remain in the production database.
Local demo accounts and expenses are not copied to production.

## 2. Environment

Keep the existing database, JWT, Google, Telegram, Twilio, Groq and OCR secrets.
`WEBHOOK_SECRET` is required at startup, including local Compose. Generate a
unique value with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
If a deployed service ever used an empty signing secret, replace it in Render
and every trusted legacy integration, then redeploy. Do not reuse an empty or
placeholder value. Native Telegram and Twilio use their own provider signatures.
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
The model needs the existing Groq quota. HTTP 429 and 503 responses use provider
cooldowns. Timeouts and other network failures use bounded durable-queue retries
without a provider cooldown.

Context survives restarts in PostgreSQL and expires for lookup after 30 minutes.
Queries include pending review, exclude duplicates and income, and show amounts as
recorded (there is no per-record currency field). Bot edits/deletes are disabled.
Receipt images/PDFs retain their existing Google Drive and OCR requirements.

If the new release fails after bot cutover, stop intake and drain or quarantine
pending new-release `inbound` jobs before redeploying the previous release. The
old release cannot safely interpret conversational jobs or their intent checkpoints.
Keep a compatible release serving the queue if it cannot be drained safely.
Keep the additive migration and database records; do not roll back the migration
or delete data.
