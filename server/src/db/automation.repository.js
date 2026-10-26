const { pool } = require('./pool');

async function enqueue({ key, kind, payload }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO automation_jobs (dedupe_key, kind, payload) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [key, kind, JSON.stringify(payload)]
  );
  return rows[0] || null;
}

async function claim(client = pool) {
  // The runner holds a session advisory lock across processing. An interrupted runner
  // releases that lock when its connection closes; its unfinished job is safe to reclaim.
  const { rows } = await client.query(`
    UPDATE automation_jobs SET status = 'processing', attempts = attempts + 1, locked_at = NOW()
    WHERE id = (
      SELECT id FROM automation_jobs
      WHERE (status = 'pending' AND available_at <= NOW()) OR status = 'processing'
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING *
  `);
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
  const exhausted = permanent || job.attempts >= 5;
  const delay = Math.max(retryAfter, Math.min(3600, 30 * 2 ** (job.attempts - 1)));
  // Do not persist provider bodies, token-bearing URLs, or submitted document text in errors.
  await client.query(`UPDATE automation_jobs SET status = $2, locked_at = NULL,
    available_at = NOW() + $3 * INTERVAL '1 second', last_error = $4 WHERE id = $1`,
  [job.id, exhausted ? 'failed' : 'pending', delay, permanent ? 'Input or configuration rejected' : 'Provider or processing failure']);
  return exhausted;
}

module.exports = { enqueue, claim, checkpoint, complete, fail };
