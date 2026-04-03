const { pool } = require('./pool');
const organizationsRepository = require('./organizations.repository');

async function initDb() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT UNIQUE,
      first_name    TEXT,
      password_hash TEXT,
      telegram_id   BIGINT UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN created_at SET DEFAULT NOW();
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(email)) WHERE email IS NOT NULL;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      join_code  TEXT NOT NULL DEFAULT LOWER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 10)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS join_code TEXT;');
  await pool.query(
    `ALTER TABLE organizations
     ALTER COLUMN join_code
     SET DEFAULT LOWER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 10));`
  );
  await pool.query(
    `UPDATE organizations
     SET join_code = NULL
     WHERE join_code IS NOT NULL
       AND BTRIM(join_code) = ''`
  );
  await organizationsRepository.ensureOrganizationJoinCodes(pool);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_join_code_unique ON organizations (join_code);');
  await pool.query('ALTER TABLE organizations ALTER COLUMN join_code SET NOT NULL;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('founder', 'admin', 'member')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_integrations (
      id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id            UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      owner_user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      google_email               TEXT NOT NULL,
      refresh_token_ciphertext   BYTEA NOT NULL,
      refresh_token_iv           BYTEA NOT NULL,
      refresh_token_tag          BYTEA NOT NULL,
      drive_root_folder_id       TEXT NOT NULL UNIQUE,
      created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_settings (
      organization_id              UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      opening_cash_balance         NUMERIC(14, 2) NOT NULL CHECK (opening_cash_balance >= 0),
      opening_cash_effective_date  DATE NOT NULL,
      created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category            TEXT NOT NULL,
      normalized_category TEXT NOT NULL,
      monthly_limit       NUMERIC(14, 2) NOT NULL CHECK (monthly_limit > 0),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount                      NUMERIC(14, 2) NOT NULL,
      vendor                      TEXT NOT NULL,
      transaction_type            TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income', 'salary')),
      category                    TEXT NOT NULL,
      transaction_date            DATE NOT NULL,
      confidence_score            NUMERIC(5, 4),
      duplicate_of_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      duplicate_score             NUMERIC(4, 3) CHECK (duplicate_score IS NULL OR (duplicate_score >= 0 AND duplicate_score <= 1)),
      status                      TEXT NOT NULL CHECK (status IN ('auto_verified', 'pending_review')),
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      storage_kind   TEXT NOT NULL DEFAULT 'google_drive',
      drive_file_id  TEXT,
      drive_folder_id TEXT,
      original_name  TEXT NOT NULL,
      stored_name    TEXT NOT NULL,
      file_type      TEXT NOT NULL,
      content_hash   CHAR(64) NOT NULL,
      text_content   TEXT,
      uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT documents_storage_kind_check CHECK (storage_kind IN ('google_drive', 'inline_text')),
      CONSTRAINT documents_storage_fields_check CHECK (
        (
          storage_kind = 'google_drive'
          AND drive_file_id IS NOT NULL
          AND drive_folder_id IS NOT NULL
          AND text_content IS NULL
        )
        OR
        (
          storage_kind = 'inline_text'
          AND drive_file_id IS NULL
          AND drive_folder_id IS NULL
          AND text_content IS NOT NULL
        )
      ),
      UNIQUE (organization_id, content_hash)
    );
  `);

  await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_kind TEXT;');
  await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS text_content TEXT;');
  await pool.query('UPDATE documents SET storage_kind = \'google_drive\' WHERE storage_kind IS NULL;');
  await pool.query('ALTER TABLE documents ALTER COLUMN storage_kind SET DEFAULT \'google_drive\';');
  await pool.query('ALTER TABLE documents ALTER COLUMN storage_kind SET NOT NULL;');
  await pool.query('ALTER TABLE documents ALTER COLUMN drive_file_id DROP NOT NULL;');
  await pool.query('ALTER TABLE documents ALTER COLUMN drive_folder_id DROP NOT NULL;');
  await pool.query('ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_storage_kind_check;');
  await pool.query(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_storage_kind_check
    CHECK (storage_kind IN ('google_drive', 'inline_text'));
  `);
  await pool.query('ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_storage_fields_check;');
  await pool.query(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_storage_fields_check
    CHECK (
      (
        storage_kind = 'google_drive'
        AND drive_file_id IS NOT NULL
        AND drive_folder_id IS NOT NULL
        AND text_content IS NULL
      )
      OR
      (
        storage_kind = 'inline_text'
        AND drive_file_id IS NULL
        AND drive_folder_id IS NULL
        AND text_content IS NOT NULL
      )
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_embeddings (
      transaction_id UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      embedding      VECTOR(384) NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS embedding_jobs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id  UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status          TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      attempt_count   INT NOT NULL DEFAULT 0,
      max_attempts    INT NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source          TEXT NOT NULL CONSTRAINT ingestion_jobs_source_check CHECK (source IN ('telegram', 'text')),
      file_name       TEXT NOT NULL,
      status          TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    );
  `);

  await pool.query('ALTER TABLE ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_source_check;');
  await pool.query(`
    ALTER TABLE ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_source_check
    CHECK (source IN ('telegram', 'text'));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orphan_drive_files (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      drive_file_id   TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cleanup_status  TEXT NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('pending', 'deleted', 'failed'))
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      action         TEXT NOT NULL,
      previous_value JSONB,
      new_value      JSONB,
      "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approvals (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      approved_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_organization_members_user_org ON organization_members (user_id, organization_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_organization_members_org_created_at ON organization_members (organization_id, created_at);');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_category_budgets_org_normalized_category ON category_budgets (organization_id, normalized_category);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_category_budgets_org_category ON category_budgets (organization_id, category);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON transactions (organization_id, transaction_date DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_org_type_status ON transactions (organization_id, transaction_type, status);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_transaction_id ON documents (transaction_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_drive_file_id ON documents (drive_file_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_next_attempt ON embedding_jobs (status, next_attempt_at);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_created_at ON ingestion_jobs (status, created_at);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orphan_drive_files_cleanup_status_created_at ON orphan_drive_files (cleanup_status, created_at);');
}

module.exports = { initDb };
