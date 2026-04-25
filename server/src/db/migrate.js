const { pool } = require('./pool');
const { migrations } = require('./migrations');

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrationNames(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name ASC');
  return new Set(rows.map((row) => row.name));
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await ensureSchemaMigrationsTable(client);
    const appliedMigrationNames = await getAppliedMigrationNames(client);
    const executedMigrations = [];

    for (const migration of migrations) {
      if (appliedMigrationNames.has(migration.name)) {
        continue;
      }

      await client.query('BEGIN');

      try {
        await migration.up(client);
        await client.query(
          'INSERT INTO schema_migrations (name, applied_at) VALUES ($1, NOW())',
          [migration.name]
        );
        await client.query('COMMIT');
        executedMigrations.push(migration.name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return {
      executed_migrations: executedMigrations,
      pending_migrations: Math.max(migrations.length - appliedMigrationNames.size - executedMigrations.length, 0),
      total_migrations: migrations.length
    };
  } finally {
    client.release();
  }
}

module.exports = {
  runMigrations
};
