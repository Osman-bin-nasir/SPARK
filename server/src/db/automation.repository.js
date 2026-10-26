const { pool } = require('./pool');
const { env } = require('../config/env');
const events = require('../services/automation-events');
const MAX_ATTEMPTS = 5;

async function enqueue({ key, kind, payload }, client = pool) {
  const { rows } = await client.query(
    `WITH inserted AS (INSERT INTO automation_jobs (dedupe_key, kind, payload, coalesce_key, available_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW() + $5 * INTERVAL '1 millisecond')
     ON CONFLICT DO NOTHING RETURNING id, kind, available_at)
     SELECT id, available_at, CASE WHEN $6 THEN pg_notify('spark_automation', kind) END FROM inserted`,
    [key, kind, JSON.stringify(payload), kind === 'sheets' ? `sheets:${payload.organizationId}` : null,
      kind === 'sheets' ? env.automationSheetsDelayMs : 0, !env.automationRunInApi]
  );
  if (client === pool && rows[0]) events.emit('work', kind, rows[0].available_at);
  return rows[0] || null;
}

async function claim(client = pool, kinds = ['inbound', 'reply', 'insights', 'sheets']) {
  // The runner holds a session advisory lock across processing. An interrupted runner
  // releases that lock when its connection closes; its unfinished job is safe to reclaim.
  // A process crash cannot reach fail(), so retire exhausted interrupted jobs here
  // before they can be reclaimed again or block newer work at the queue head.
  await client.query(`
    UPDATE automation_jobs SET status = 'failed', locked_at = NULL,
      last_error = 'Interrupted repeatedly during processing'
    WHERE status = 'processing' AND attempts >= $1 AND kind = ANY($2::text[])
  `, [MAX_ATTEMPTS, kinds]);
  const { rows } = await client.query(`
    UPDATE automation_jobs SET status = 'processing', attempts = attempts + 1, locked_at = NOW()
    WHERE id = (
      SELECT id FROM automation_jobs
      WHERE ((status = 'pending' AND available_at <= NOW()) OR status = 'processing')
        AND kind = ANY($1::text[])
      ORDER BY CASE kind WHEN 'reply' THEN 0 WHEN 'inbound' THEN 1 ELSE 2 END,
        created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING *
  `, [kinds]);
  return rows[0] || null;
}

async function checkpoint(id, progress, client = pool) {
  await client.query('UPDATE automation_jobs SET progress = progress || $2::jsonb WHERE id = $1', [id, JSON.stringify(progress)]);
}

async function complete(id, client = pool) {
  await client.query(`UPDATE automation_jobs SET status = 'completed', completed_at = NOW(),
    locked_at = NULL, last_error = NULL WHERE id = $1`, [id]);
}

async function fail(job, { permanent = false, retryAfter = 0 } = {}, client = pool) {
  const exhausted = permanent || job.attempts >= MAX_ATTEMPTS;
  const delay = Math.max(retryAfter, Math.min(3600, 30 * 2 ** (job.attempts - 1)));
  // Do not persist provider bodies, token-bearing URLs, or submitted document text in errors.
  await client.query(`UPDATE automation_jobs SET status = $2, locked_at = NULL,
    coalesce_key = NULL,
    available_at = NOW() + $3 * INTERVAL '1 second', last_error = $4 WHERE id = $1`,
  [job.id, exhausted ? 'failed' : 'pending', delay, permanent ? 'Input or configuration rejected' : 'Provider or processing failure']);
  return exhausted;
}

async function nextAvailable(client = pool, kinds = ['inbound', 'reply', 'insights', 'sheets']) {
  const { rows } = await client.query(`SELECT MIN(CASE WHEN status = 'processing' THEN NOW()
    ELSE available_at END) AS next_at FROM automation_jobs
    WHERE status IN ('pending', 'processing') AND kind = ANY($1::text[])`, [kinds]);
  return rows[0]?.next_at || null;
}

async function retentionPreview(days = 7, client = pool) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS jobs,
    COALESCE(SUM(pg_column_size(payload) + pg_column_size(progress)), 0)::bigint AS bytes
    FROM automation_jobs WHERE status = 'completed' AND redacted_at IS NULL
      AND completed_at < NOW() - $1 * INTERVAL '1 day'`, [days]);
  return rows[0];
}

async function redactCompleted(days, client = pool) {
  if (!Number.isInteger(days) || days < 7) throw new Error('Retention must be at least 7 days');
  // Explicit operator action only. Never touch failed/pending work or dedupe keys.
  const { rowCount } = await client.query(`UPDATE automation_jobs SET payload = '{}'::jsonb,
    progress = '{}'::jsonb, redacted_at = NOW() WHERE id IN (
      SELECT id FROM automation_jobs WHERE status = 'completed' AND redacted_at IS NULL
        AND completed_at < NOW() - $1 * INTERVAL '1 day'
      ORDER BY completed_at LIMIT 500
    )`, [days]);
  return rowCount;
}

module.exports = { enqueue, claim, checkpoint, complete, fail, nextAvailable, retentionPreview, redactCompleted };
