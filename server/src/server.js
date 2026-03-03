const app = require('./app');
const { env } = require('./config/env');
const { initDb } = require('./config/db');

async function start() {
  try {
    await initDb();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
