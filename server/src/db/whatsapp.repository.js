const { pool } = require('./pool');

async function createLoginToken({ whatsappId }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO whatsapp_login_tokens (whatsapp_id)
     VALUES ($1)
     RETURNING token, whatsapp_id, expires_at, used_at, created_at`,
    [whatsappId]
  );

  return rows[0] || null;
}

async function findActiveLoginToken(token, client = pool) {
  const { rows } = await client.query(
    `SELECT token, whatsapp_id, expires_at, used_at, created_at
     FROM whatsapp_login_tokens
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
    `UPDATE whatsapp_login_tokens
     SET used_at = NOW()
     WHERE token = $1`,
    [token]
  );
}

async function upsertJoinIntent({ whatsappId, organizationId, joinCode }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO whatsapp_join_intents (
       whatsapp_id,
       organization_id,
       join_code,
       updated_at,
       expires_at
     )
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '7 days')
     ON CONFLICT (whatsapp_id)
     DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       join_code = EXCLUDED.join_code,
       updated_at = NOW(),
       expires_at = EXCLUDED.expires_at
     RETURNING whatsapp_id, organization_id, join_code, expires_at`,
    [whatsappId, organizationId, joinCode]
  );

  return rows[0] || null;
}

async function findPendingJoinIntent(whatsappId, client = pool) {
  const { rows } = await client.query(
    `SELECT whatsapp_id, organization_id, join_code, expires_at
     FROM whatsapp_join_intents
     WHERE whatsapp_id = $1
       AND expires_at > NOW()
     LIMIT 1`,
    [whatsappId]
  );

  return rows[0] || null;
}

async function clearJoinIntent(whatsappId, client = pool) {
  await client.query(
    'DELETE FROM whatsapp_join_intents WHERE whatsapp_id = $1',
    [whatsappId]
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
