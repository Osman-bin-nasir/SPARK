const { pool } = require('./pool');

async function tryCreateExtension(extensionName) {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extensionName};`);
  } catch (error) {
    console.warn(`Skipping ${extensionName} extension: ${error.message}`);
  }
}

async function tryCreateIndex(statement, description) {
  try {
    await pool.query(statement);
  } catch (error) {
    console.warn(`Skipping ${description}: ${error.message}`);
  }
}

async function initDb() {
  await tryCreateExtension('pgcrypto');
  await tryCreateExtension('vector');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      telegram_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT;');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();');
  await pool.query('UPDATE users SET id = gen_random_uuid() WHERE id IS NULL;');
  await pool.query('UPDATE users SET created_at = NOW() WHERE created_at IS NULL;');

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'name'
      ) THEN
        ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'telegram_id'
      ) THEN
        ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
      END IF;
    END
    $$;
  `);

  await tryCreateIndex(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_id_unique_idx ON users (id);',
    'users.id unique index'
  );
  await tryCreateIndex(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique_idx ON users (telegram_id) WHERE telegram_id IS NOT NULL;',
    'users.telegram_id unique index'
  );
  await tryCreateIndex(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email) WHERE email IS NOT NULL;',
    'users.email unique index'
  );
}

module.exports = { initDb };
