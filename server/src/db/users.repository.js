const { pool } = require('./pool');
const { HttpError } = require('../utils/http-error');

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    telegram_id: row.telegram_id,
    whatsapp_id: row.whatsapp_id,
    created_at: row.created_at
  };
}

async function findUserByEmail(email, client = pool) {
  const { rows } = await client.query(
    `SELECT id, email, password_hash, telegram_id, whatsapp_id, created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

async function findUserByTelegramId(telegramId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, email, password_hash, telegram_id, whatsapp_id, created_at
     FROM users
     WHERE telegram_id = $1
     LIMIT 1`,
    [telegramId]
  );

  return rows[0] || null;
}

async function findUserByWhatsappId(whatsappId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, email, password_hash, telegram_id, whatsapp_id, created_at
     FROM users
     WHERE whatsapp_id = $1
     LIMIT 1`,
    [whatsappId]
  );

  return rows[0] || null;
}

async function findUserById(id, client = pool) {
  const { rows } = await client.query(
    `SELECT id, email, password_hash, telegram_id, whatsapp_id, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function createUser({ email, passwordHash, telegramId = null, whatsappId = null }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, telegram_id, whatsapp_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [email, passwordHash, telegramId, whatsappId]
  );

  return mapUser(rows[0]);
}

async function completeTelegramUserRegistration(
  {
    userId,
    email,
    passwordHash
  },
  client = pool
) {
  const { rows } = await client.query(
    `UPDATE users
     SET email = $1,
         password_hash = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [email, passwordHash, userId]
  );

  return mapUser(rows[0]);
}

async function completeWhatsappUserRegistration(
  {
    userId,
    email,
    passwordHash
  },
  client = pool
) {
  const { rows } = await client.query(
    `UPDATE users
     SET email = $1,
         password_hash = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [email, passwordHash, userId]
  );

  return mapUser(rows[0]);
}

async function upsertTelegramPlaceholder({ telegramId }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO users (telegram_id)
     VALUES ($1)
     ON CONFLICT (telegram_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [telegramId]
  );

  return mapUser(rows[0]);
}

async function upsertWhatsappPlaceholder({ whatsappId }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO users (whatsapp_id)
     VALUES ($1)
     ON CONFLICT (whatsapp_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [whatsappId]
  );

  return mapUser(rows[0]);
}

async function linkTelegramToUser({ userId, telegramId }, client = pool) {
  const { rows: userRows } = await client.query(
    `SELECT id, email, telegram_id, created_at
     FROM users
     WHERE id = $1
     FOR UPDATE`,
    [userId]
  );

  const user = userRows[0];

  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  if (user.telegram_id && String(user.telegram_id) !== String(telegramId)) {
    throw new HttpError(409, 'This web account is already linked to another Telegram account');
  }

  const { rows: conflictRows } = await client.query(
    `SELECT id, email
     FROM users
     WHERE telegram_id = $1
       AND id <> $2
     LIMIT 1`,
    [telegramId, userId]
  );

  const conflictUser = conflictRows[0];

  if (conflictUser) {
    if (conflictUser.email) {
      throw new HttpError(409, 'This Telegram account is already linked to another user');
    }

    await client.query('DELETE FROM telegram_login_tokens WHERE telegram_id = $1', [telegramId]);
    await client.query('DELETE FROM telegram_join_intents WHERE telegram_id = $1', [telegramId]);
    await client.query('DELETE FROM users WHERE id = $1', [conflictUser.id]);
  }

  const { rows } = await client.query(
    `UPDATE users
     SET telegram_id = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [telegramId, userId]
  );

  return mapUser(rows[0]);
}

async function linkWhatsappToUser({ userId, whatsappId }, client = pool) {
  const { rows: userRows } = await client.query(
    `SELECT id, email, whatsapp_id, created_at
     FROM users
     WHERE id = $1
     FOR UPDATE`,
    [userId]
  );

  const user = userRows[0];

  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  if (user.whatsapp_id && String(user.whatsapp_id) !== String(whatsappId)) {
    throw new HttpError(409, 'This web account is already linked to another WhatsApp account');
  }

  const { rows: conflictRows } = await client.query(
    `SELECT id, email
     FROM users
     WHERE whatsapp_id = $1
       AND id <> $2
     LIMIT 1`,
    [whatsappId, userId]
  );

  const conflictUser = conflictRows[0];

  if (conflictUser) {
    if (conflictUser.email) {
      throw new HttpError(409, 'This WhatsApp account is already linked to another user');
    }

    await client.query('DELETE FROM whatsapp_login_tokens WHERE whatsapp_id = $1', [whatsappId]);
    await client.query('DELETE FROM whatsapp_join_intents WHERE whatsapp_id = $1', [whatsappId]);
    await client.query('DELETE FROM users WHERE id = $1', [conflictUser.id]);
  }

  const { rows } = await client.query(
    `UPDATE users
     SET whatsapp_id = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [whatsappId, userId]
  );

  return mapUser(rows[0]);
}

async function unlinkTelegramFromUser({ userId }, client = pool) {
  const { rows } = await client.query(
    `UPDATE users
     SET telegram_id = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [userId]
  );
  return mapUser(rows[0]);
}

async function unlinkWhatsappFromUser({ userId }, client = pool) {
  const { rows } = await client.query(
    `UPDATE users
     SET whatsapp_id = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, telegram_id, whatsapp_id, created_at`,
    [userId]
  );
  return mapUser(rows[0]);
}

module.exports = {
  completeTelegramUserRegistration,
  completeWhatsappUserRegistration,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByTelegramId,
  findUserByWhatsappId,
  linkTelegramToUser,
  linkWhatsappToUser,
  unlinkTelegramFromUser,
  unlinkWhatsappFromUser,
  mapUser,
  upsertTelegramPlaceholder,
  upsertWhatsappPlaceholder
};
