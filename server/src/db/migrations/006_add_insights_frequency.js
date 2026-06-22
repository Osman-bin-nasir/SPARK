const migration = {
  name: '006_add_insights_frequency',
  async up(client) {
    await client.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS insights_frequency TEXT NOT NULL DEFAULT 'none'
      CONSTRAINT check_insights_frequency CHECK (insights_frequency IN ('weekly', 'monthly', 'none'));
    `);
  }
};

module.exports = migration;
