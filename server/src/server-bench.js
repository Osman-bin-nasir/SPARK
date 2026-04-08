const t0 = Date.now();
const app = require('./app');
console.log('require app:', Date.now() - t0);

const { env, validateEnv } = require('./config/env');
const { initDb } = require('./db/init');
const { startBackgroundWorkers } = require('./services/background-workers.service');

async function start() {
  try {
    const t1 = Date.now();
    validateEnv();
    console.log('validateEnv:', Date.now() - t1);

    const t2 = Date.now();
    await initDb();
    console.log('initDb:', Date.now() - t2);

    const t3 = Date.now();
    startBackgroundWorkers();
    console.log('startBackgroundWorkers:', Date.now() - t3);

    const t4 = Date.now();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
      console.log('app.listen cb:', Date.now() - t4);
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
