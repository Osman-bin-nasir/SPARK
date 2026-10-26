const { env, validateEnv } = require('./config/env');
const { pool } = require('./db/pool');
const { assertDatabaseReady } = require('./db/init');
const { startBackgroundWorkers, stopBackgroundWorkers } = require('./services/background-workers.service');

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(`Received ${signal}. Stopping worker...`);

  try {
    await stopBackgroundWorkers();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Worker shutdown failed:', error.message);
    process.exit(1);
  }
}

async function start() {
  try {
    validateEnv();
    if (env.automationRunInApi) throw new Error('Automation runs in the API. Do not start a second worker; set AUTOMATION_RUN_IN_API=false on both processes to use a dedicated worker.');
    await assertDatabaseReady();
    startBackgroundWorkers({ listen: true });
    console.info('Background worker started.');
  } catch (error) {
    console.error('Failed to start worker:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

start();
