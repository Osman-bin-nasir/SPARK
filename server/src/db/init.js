const { pool } = require('./pool');

async function initDb() {
  // Enable pgcrypto for gen_random_uuid()
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT        UNIQUE,
      first_name    TEXT,
      password_hash TEXT,
      telegram_id   BIGINT      UNIQUE,
      created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `);

  // Index for sorting/filtering by signup date
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);');
}

module.exports = { initDb };
