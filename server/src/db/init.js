const { pool } = require('./pool');
const { latestMigrationName, migrations } = require('./migrations');

async function ensureDatabaseConnection(client = pool) {
  await client.query('SELECT 1');
}

async function assertDatabaseReady(client = pool) {
  await ensureDatabaseConnection(client);

  const { rows: migrationTableRows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'schema_migrations'
     ) AS exists`
  );

  if (!migrationTableRows[0]?.exists) {
    throw new Error('Database schema is not initialized. Run `npm run migrate` before starting the app.');
  }

  const { rows: appliedRows } = await client.query('SELECT name FROM schema_migrations ORDER BY name ASC');
  const appliedMigrationNames = new Set(appliedRows.map((row) => row.name));
  const missingMigrationNames = migrations
    .map((migration) => migration.name)
    .filter((migrationName) => !appliedMigrationNames.has(migrationName));

  if (missingMigrationNames.length > 0) {
    throw new Error(
      `Database schema is missing migrations: ${missingMigrationNames.join(', ')}. Run \`npm run migrate\`.`
    );
  }

  return {
    latest_migration: latestMigrationName,
    applied_migrations: [...appliedMigrationNames]
  };
}

module.exports = {
  assertDatabaseReady,
  ensureDatabaseConnection
};
