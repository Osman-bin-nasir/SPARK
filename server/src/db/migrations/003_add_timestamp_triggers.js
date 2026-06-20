const migration = {
  name: '003_add_timestamp_triggers',
  async up(client) {
    // 1. Create the trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION preserve_created_at_and_update_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Preserve the original created_at timestamp
        NEW.created_at = OLD.created_at;
        -- Automatically update updated_at to the current time
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Attach BEFORE UPDATE trigger to users table
    await client.query('DROP TRIGGER IF EXISTS trg_users_timestamp ON users;');
    await client.query(`
      CREATE TRIGGER trg_users_timestamp
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION preserve_created_at_and_update_timestamp();
    `);

    // 3. Attach BEFORE UPDATE trigger to other tables with created_at/updated_at columns
    const tables = ['organizations', 'google_integrations', 'finance_settings', 'category_budgets', 'embedding_jobs'];
    for (const table of tables) {
      await client.query(`DROP TRIGGER IF EXISTS trg_${table}_timestamp ON ${table};`);
      await client.query(`
        CREATE TRIGGER trg_${table}_timestamp
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION preserve_created_at_and_update_timestamp();
      `);
    }
  }
};

module.exports = migration;
