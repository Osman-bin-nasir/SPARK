const { pool } = require('./pool');

async function createLoginToken({ telegramId }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO telegram_login_tokens (telegram_id)
     VALUES ($1)
     RETURNING token, telegram_id, expires_at, used_at, created_at`,
    [telegramId]
  );

  return rows[0] || null;
}

async function findActiveLoginToken(token, client = pool) {
  const { rows } = await client.query(
    `SELECT token, telegram_id, expires_at, used_at, created_at
     FROM telegram_login_tokens
     WHERE token = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  return rows[0] || null;
}

async function markLoginTokenUsed({ token }, client = pool) {
  await client.query(
    `UPDATE telegram_login_tokens
     SET used_at = NOW()
     WHERE token = $1`,
    [token]
  );
}

async function upsertJoinIntent({ telegramId, organizationId, joinCode }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO telegram_join_intents (
       telegram_id,
       organization_id,
       join_code,
       updated_at,
       expires_at
     )
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '7 days')
     ON CONFLICT (telegram_id)
     DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       join_code = EXCLUDED.join_code,
       updated_at = NOW(),
       expires_at = EXCLUDED.expires_at
     RETURNING telegram_id, organization_id, join_code, expires_at`,
    [telegramId, organizationId, joinCode]
  );

  return rows[0] || null;
}

async function findPendingJoinIntent(telegramId, client = pool) {
  const { rows } = await client.query(
    `SELECT telegram_id, organization_id, join_code, expires_at
     FROM telegram_join_intents
     WHERE telegram_id = $1
       AND expires_at > NOW()
     LIMIT 1`,
    [telegramId]
  );

  return rows[0] || null;
}

async function clearJoinIntent(telegramId, client = pool) {
  await client.query(
    'DELETE FROM telegram_join_intents WHERE telegram_id = $1',
    [telegramId]
  );
}

module.exports = {
  clearJoinIntent,
  createLoginToken,
  findActiveLoginToken,
  findPendingJoinIntent,
  markLoginTokenUsed,
  upsertJoinIntent
};
