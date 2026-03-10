const app = require('./app');
const { env, validateEnv } = require('./config/env');
const { initDb } = require('./db/init');
const { startBackgroundWorkers } = require('./services/background-workers.service');

async function start() {
  try {
    validateEnv();
    await initDb();
    startBackgroundWorkers();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
