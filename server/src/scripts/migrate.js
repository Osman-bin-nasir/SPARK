const { validateEnv } = require('../config/env');
const { runMigrations } = require('../db/migrate');
const { pool } = require('../db/pool');

async function main() {
  try {
    validateEnv();
    const result = await runMigrations();

    if (result.executed_migrations.length === 0) {
      console.info('Database migrations are already up to date.');
    } else {
      console.info(`Applied migrations: ${result.executed_migrations.join(', ')}`);
    }
  } catch (error) {
    console.error('Failed to run migrations:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
