module.exports = {
  name: '010_efficient_automation',
  async up(client) {
    // Additive only: existing pending jobs and their payloads remain intact.
    await client.query(`
      ALTER TABLE automation_jobs ADD COLUMN coalesce_key TEXT;
      ALTER TABLE automation_jobs ADD COLUMN redacted_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX automation_pending_coalesce ON automation_jobs (coalesce_key)
        WHERE status = 'pending' AND coalesce_key IS NOT NULL;
      CREATE INDEX automation_retention ON automation_jobs (completed_at)
        WHERE status = 'completed' AND redacted_at IS NULL;
      ALTER TABLE google_integrations ADD COLUMN transactions_sheet_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE orphan_drive_files ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orphan_drive_files ADD COLUMN next_cleanup_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
  }
};
