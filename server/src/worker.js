const { validateEnv } = require('./config/env');
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
    process.exit(0);
  } catch (error) {
    console.error('Worker shutdown failed:', error.message);
    process.exit(1);
  }
}

async function start() {
  try {
    validateEnv();
    await assertDatabaseReady();
    startBackgroundWorkers();
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
