const app = require('./app');
const { env, validateEnv } = require('./config/env');
const { assertDatabaseReady } = require('./db/init');

async function start() {
  try {
    validateEnv();
    await assertDatabaseReady();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
