const migration = {
  name: '002_add_whatsapp_integration',
  async up(client) {
    // 1. Add whatsapp_id to users
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS whatsapp_id BIGINT UNIQUE;
    `);

    // 2. Drop and recreate ingestion_jobs_source_check constraint
    await client.query('ALTER TABLE ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_source_check;');
    await client.query(`
      ALTER TABLE ingestion_jobs
      ADD CONSTRAINT ingestion_jobs_source_check
      CHECK (source IN ('telegram', 'text', 'whatsapp'));
    `);

    // 3. Add platform column to ingestion_jobs
    await client.query(`
      ALTER TABLE ingestion_jobs
      ADD COLUMN IF NOT EXISTS platform TEXT;
    `);

    // 4. Update platform column for existing records
    await client.query(`
      UPDATE ingestion_jobs
      SET platform = source
      WHERE platform IS NULL AND source IN ('telegram', 'text');
    `);

    // 5. Create whatsapp_join_intents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_join_intents (
        whatsapp_id     BIGINT PRIMARY KEY REFERENCES users(whatsapp_id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        join_code       TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
      );
    `);

    // 6. Create whatsapp_login_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_login_tokens (
        token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        whatsapp_id BIGINT NOT NULL REFERENCES users(whatsapp_id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
        used_at     TIMESTAMPTZ
      );
    `);

    // 7. Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_join_intents_expires_at ON whatsapp_join_intents (expires_at);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_login_tokens_active ON whatsapp_login_tokens (whatsapp_id, expires_at) WHERE used_at IS NULL;');
  }
};

module.exports = migration;
