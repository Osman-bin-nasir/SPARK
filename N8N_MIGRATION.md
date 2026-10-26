# Native SPARK automation

SPARK receives Telegram and Twilio WhatsApp messages directly, extracts receipts
with OCR.space and Groq, records transactions through the existing ingestion service,
syncs Google Sheets, and sends scheduled insights without an n8n runtime.
No n8n workflow exports are in this repository; this replaces the integration
contracts present in the backend. Compare any additional private workflows against
this list before retiring n8n.

## Configuration

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
A PostgreSQL session advisory lock prevents concurrent automation runners across
processes. Existing orphan Drive cleanup continues in the worker.

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
npm test
```

The `automation_jobs` table contains status, attempts, availability and progress.
Provider errors use generic descriptions; credentials and provider response bodies
are excluded from logs. Queue payloads contain receipt text and account-link tokens:
restrict database access and apply your retention policy. Keep dedupe keys when
purging old payloads. Retrying failed jobs preserves committed transaction checkpoints.

API references: [Groq limits](https://console.groq.com/docs/rate-limits),
[structured outputs](https://console.groq.com/docs/structured-outputs),
[Telegram webhooks](https://core.telegram.org/bots/api#setwebhook),
[Twilio validation](https://www.twilio.com/docs/usage/security),
[WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates),
[OCR.space limits](https://ocr.space/ocrapi).
