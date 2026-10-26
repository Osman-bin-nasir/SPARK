module.exports = {
  name: '009_native_automation',
  async up(client) {
    await client.query(`
      CREATE TABLE automation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dedupe_key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('inbound', 'reply', 'insights', 'sheets')),
        payload JSONB NOT NULL,
        progress JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX automation_jobs_pending ON automation_jobs (available_at, created_at)
        WHERE status IN ('pending', 'processing');
    `);
  }
};
