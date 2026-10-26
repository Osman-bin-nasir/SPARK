const app = require('./app');
const { env, validateEnv } = require('./config/env');
const { assertDatabaseReady } = require('./db/init');
const { startBackgroundWorkers, stopBackgroundWorkers } = require('./services/background-workers.service');
const { pool } = require('./db/pool');
let server;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const closed = new Promise(resolve => server ? server.close(resolve) : resolve());
  await stopBackgroundWorkers();
  await closed;
  await pool.end();
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown().catch(() => process.exit(1)));
}

async function start() {
  try {
    validateEnv();
    await assertDatabaseReady();
    server = app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
      if (env.automationRunInApi) startBackgroundWorkers();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
