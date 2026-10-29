# Native SPARK automation

SPARK receives Telegram and Twilio WhatsApp messages directly, extracts receipts
with OCR.space and Groq, records transactions through the existing ingestion service,
syncs Google Sheets, and sends scheduled insights without an n8n runtime.
No n8n workflow exports are in this repository; this replaces the integration
contracts present in the backend. Compare any additional private workflows against
this list before retiring n8n.

## Configuration

### Conversational expense messages

Both bots route linked users' text through a shared Groq intent classifier before
performing financial work. Previously every non-command message went to receipt
extraction, so questions looked like invalid receipts and undated notes failed.
Groq now identifies expense notes, personal spending queries, comparisons,
category summaries and clarification follow-ups in English or Hinglish. The
existing `GROQ_API_KEY` and `GROQ_MODEL` are reused; no new keys are needed.
`openai/gpt-oss-120b` supports the strict JSON schema used here. AJV independently
validates output before execution. Dates are checked on the server; named calendar
periods use `AUTOMATION_TIME_ZONE` and last week means Monday through Sunday.
Undated expense notes default to today. Queries default to this month to date.

Migration `012_bot_conversations` stores only the last interpreted query or pending
clarification, separately per workspace, user and platform, with a 30-minute expiry.
Expired context is ignored; each identity overwrites its single row. No polling
or additional worker is introduced. Deploy migrations before starting the bots.
Interpretations and ingestion results are checkpointed in the existing durable
queue; webhook redelivery protection and transactional ingestion remain in use.

Conversational queries include only transactions attributed to the sender by the
existing `transaction.created` audit trail, exclude duplicates/income, and include
expenses and salaries awaiting review. They never expose another member's spend.
Legacy entries without creation attribution are omitted. Category queries use
case-insensitive labels and common food/transport aliases. Replies use SQL totals,
not model-calculated amounts. SPARK has no per-transaction currency field, so
amounts are reported in recorded units without guessing a currency or conversion.

Attachments still use the existing OCR/Drive path. Slash commands and scheduled
workspace reports retain their existing behavior. Chat edit/delete/undo requests
do not modify records: users are directed to the existing Transactions UI to review
and confirm changes. General finance replies are basic guidance; assessing whether
spending is excessive requires the user's budget/goals and is not inferred by AI.

Use `server/.env` for local Node, the root `.env` for Docker Compose, or your host's
environment secrets. Do not commit real credentials. Existing database, JWT and
Google OAuth settings remain required.

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram API access |
| `TELEGRAM_WEBHOOK_SECRET` | Random alphanumeric secret for incoming Telegram requests |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio API access and signature verification |
| `TWILIO_WHATSAPP_FROM` | Configured sandbox/business sender in `whatsapp:+E164` format |
| `PUBLIC_API_BASE_URL` | Public HTTPS backend origin, no path; match Twilio's webhook origin |
| `GROQ_API_KEY` | Groq API access |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b`, available on Groq's free plan |
| `OCR_SPACE_API_KEY` | OCR.space API access |
| `OCR_MAX_FILE_BYTES` | Defaults to 1 MB for free OCR (up to three PDF pages) |
| `TWILIO_INSIGHTS_CONTENT_SID` | Approved WhatsApp template with report text in variable `{{1}}` |

`AUTOMATION_ENABLED=false` disables native intake and processing.
`AUTOMATION_RUN_IN_API=true` (default) runs automation in the existing API container.
For a dedicated worker, set this to `false` on the API and run `npm run start:worker`.
Set it to `false` on that worker too. The worker refuses to start if the API is
configured as owner. Docker production no longer starts a second worker by default.
The optional dedicated worker uses PostgreSQL LISTEN/NOTIFY for immediate cross-process
wakeups; this holds an idle connection, so **use API mode for free Neon/Render hosting**.
Both modes require a direct PostgreSQL URL (not a transaction-pooler URL) because
session advisory locks protect each processing lane across replicas.
Orphan Drive cleanup also runs in API mode, so a second process is unnecessary.

## Free-tier resource use

The API wakes its queue after committed writes. Empty lanes stop querying. Retries
and delayed Sheets jobs arm timers for their actual due times. An hourly recovery
pass (`AUTOMATION_RECOVERY_MS=3600000`, minimum ten minutes) catches out-of-process
changes and missed wakeups. An entirely empty queue uses roughly 360 SQL statements
per day for recovery, instead of roughly 69,000 from the old five-second loop.
`AUTOMATION_POLL_MS` is obsolete and ignored. `/health` performs no database work.
SPARK does not ping its own host or set up an uptime monitor.

Weekly/monthly report scheduling runs at startup, when preferences change, and at
the next timezone-aware due boundary. Reports are cached for up to ten minutes
(at most 50 workspace/period entries) across recipients; each recipient is still
revalidated against the current workspace and preferences before delivery.

There are three bounded, serial lanes: receipts/reports, replies, and Sheets.
One slow provider call no longer blocks bot replies or all queue work. PostgreSQL
absorbs bursts durably instead of starting unbounded concurrent OCR/API calls.
`DATABASE_POOL_MAX=8` limits connections per process; idle connections expire after
30 seconds. This improves burst handling, but free provider quotas still limit
sustained traffic. Rate-limit backoff and the five-attempt cap remain in effect.
A 429/503 pauses its entire processing lane for at least a minute (or the longer
provider Retry-After); arriving jobs cannot bypass that cooldown and hammer the
same exhausted provider quota.
Daily retention clears completed queue payloads older than seven days by default
(`AUTOMATION_RETENTION_DAYS=7`; `0` disables it). Cleanup uses batches of 500 and
waits ten seconds between full batches. It preserves transactions, documents,
dedupe keys, and pending/processing/failed jobs. The CLI preview below shows eligible
content before manual cleanup; no production cleanup is performed by development tests.

Sheets work is coalesced per workspace with a fixed 30-second deadline
(`AUTOMATION_SHEETS_DELAY_MS`). New transactions during an active sync create a
follow-up job. A failed sync can retain its own retry alongside that follow-up.
Existing queued jobs remain intact during migration. Each refresh reads the last
12 months once, partitions the four tabs in memory, and uses two batch value calls.
Formatting runs only when the spreadsheet layout changes; sharing permissions are
checked against Google only when the workspace email fingerprint changes.
Concurrent Sheets opens in one API process share the in-flight refresh.

Orphan cleanup runs at startup and daily by default, wakes one minute after a new
orphan is tracked, and drains active batches ten seconds apart. Each file has a
durable retry deadline and a five-attempt limit. No periodic embedding/Ollama worker
is started by this automation; receipt AI/OCR requests remain remote.

Groq's free plan is an account setting, not an API parameter. Keep your account on
the free plan to avoid paid usage. Jobs respect rate-limit `Retry-After` responses
and retry with exponential backoff. Five failed attempts leave a job in `failed`
for inspection/replay. Other providers retain their own quotas and charges.
Interrupted jobs also stop after five claims, including crashes that prevent the
runner from recording a normal failure. Exhausted interrupted jobs retain their
checkpoints and no longer block newer queued work.

## Deployment and cutover

1. Deploy this code with the required secrets. Run `npm run migrate` from `server`
   before starting; the existing Docker entrypoint does this automatically.
2. Run `npm run automation -- check` from `server`. It validates Telegram, Groq
   and Twilio credentials without messages or webhook changes. For OCR it only
   checks that a key is configured.
3. Run `npm run automation -- setup` for a dry run. Once the deployment is live,
   run `npm run automation -- setup --apply-telegram`. It checks the unsigned
   route is rejected, then registers `/api/webhooks/telegram` with the shared secret.
   Pending updates are preserved. This replaces the bot's previous n8n webhook.
4. Set the Twilio sandbox/business sender's incoming message webhook to
   `POST https://YOUR_BACKEND/api/webhooks/whatsapp`. Keep the exact origin consistent
   with `PUBLIC_API_BASE_URL`. Signature validation uses the official Twilio SDK;
   forwarded-host headers do not override the trusted origin.
5. Send `/login` to the bot and link your existing account. Workspace invites work
   with `/start join_CODE` in Telegram and `join_CODE` in WhatsApp. `/join CODE`
   also works. Twilio sandbox recipients must join that sandbox first.
6. Connect Google Drive in SPARK before sending attachments. Test a small image,
   a PDF, and a note such as `Paid 42 at Cafe on 2026-10-26`. Verify transaction,
   document, verification state, reply and Sheets update. Redeliver an event to
   verify transaction deduplication.
7. Disable old n8n schedules when enabling native automation for that deployment
   to prevent duplicate reports. Preserve workflow exports for rollback.

This change does not deploy code or change webhooks at startup. Existing signed
ingestion endpoints remain compatible. To roll back, disable native automation and
restore provider webhook URLs and n8n schedules. The additive migration may remain.

## Processing and recovery

Webhooks acknowledge only after saving a PostgreSQL job. Provider event IDs have a
unique constraint to suppress redelivery. Sender identity and workspace come from
linked SPARK accounts, never model output. Telegram group messages are ignored.
Unlinked users must finish registration/linking before submitting transactions.

Receipts are downloaded from trusted provider URLs, bounded by file size, then
passed to OCR.space. Partial PDF results are rejected. Groq produces strict JSON
Schema output, followed by server validation of positive amounts, real dates,
required fields and confidence. Ambiguous receipts or missing amounts/vendors/dates
require another submission. Explicit relative dates use the arrival date in the
configured timezone. Low-confidence results use the existing pending-review flow.
Drive upload/cleanup, duplicate detection and vendor resolution are reused.

Transaction creation, its processing checkpoint and a Sheets job commit together.
A restart after commit skips extraction/ingestion and resumes the reply. Sheets and
replies retry independently. External message delivery is **at least once**: a crash
after the provider accepts a message but before marking completion may repeat a
reply/report. Cross-provider exactly-once delivery is not guaranteed.

## Reports and operations

Reports reuse organization frequency/recipient settings. They run on Mondays and
the first of the month at `AUTOMATION_REPORT_HOUR` (default 9), in
`AUTOMATION_TIME_ZONE` (default `Asia/Kolkata`). Restarts catch up the latest due
period using stable dedupe keys, without replaying every missed historical period.
Calculations use the scheduled calendar anchor. Recipient preferences and linked
destinations are rechecked immediately before sending queued reports.

WhatsApp scheduled reports require an approved template outside the 24-hour
customer-service window. Without `TWILIO_INSIGHTS_CONTENT_SID`, scheduled WhatsApp
delivery is skipped. Inbound replies and `/insights weekly` or `/insights monthly`
still work. Telegram scheduled reports need no template.

```sh
# Run from server/
npm run automation -- status
npm run automation -- retry FAILED_JOB_UUID
# Preview old completed payloads, without changing anything:
npm run automation -- retention 7
# Explicit, irreversible cleanup, at most 500 completed jobs per invocation:
npm run automation -- retention 7 --apply
npm test
```

The `automation_jobs` table contains status, attempts, availability and progress.
Provider errors use generic descriptions; credentials and provider response bodies
are excluded from logs. Queue payloads contain receipt text and account-link tokens:
restrict database access. Automatic retention runs daily; the CLI supports a preview
and explicit `--apply` for manual batches. Both keep job IDs/dedupe keys and never clear
pending, processing, failed, or recent completed jobs. It does not remove transactions
or receipt documents. Dedupe tombstones remain small but still grow with event count.
Retrying failed jobs preserves committed transaction checkpoints. In API mode, an
external CLI retry is found by the next hourly recovery pass or an API restart;
dedicated-worker mode receives it immediately via NOTIFY.

API references: [Groq limits](https://console.groq.com/docs/rate-limits),
[structured outputs](https://console.groq.com/docs/structured-outputs),
[Telegram webhooks](https://core.telegram.org/bots/api#setwebhook),
[Twilio validation](https://www.twilio.com/docs/usage/security),
[WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates),
[OCR.space limits](https://ocr.space/ocrapi).
