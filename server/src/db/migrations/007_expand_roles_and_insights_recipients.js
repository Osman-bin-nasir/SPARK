const migration = {
  name: '007_expand_roles_and_insights_recipients',
  async up(client) {
    // 1. Drop role CHECK constraint to allow co-founder and custom roles
    await client.query(`
      ALTER TABLE organization_members
      DROP CONSTRAINT IF EXISTS organization_members_role_check;
    `);

    // 2. Add insights_recipients to organizations
    await client.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS insights_recipients TEXT NOT NULL DEFAULT 'all'
      CONSTRAINT check_insights_recipients CHECK (insights_recipients IN ('all', 'admins', 'selected'));
    `);

    // 3. Add receive_insights to organization_members
    await client.query(`
      ALTER TABLE organization_members
      ADD COLUMN IF NOT EXISTS receive_insights BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 4. Set receive_insights = true for existing founders and admins
    await client.query(`
      UPDATE organization_members
      SET receive_insights = TRUE
      WHERE role IN ('founder', 'admin');
    `);
  }
};

module.exports = migration;
