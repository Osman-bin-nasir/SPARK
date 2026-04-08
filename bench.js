const t0 = Date.now();
require('dotenv').config({ path: './server/.env' });
console.log('dotenv:', Date.now() - t0);

const t1 = Date.now();
const { pool } = require('./server/src/db/pool');
console.log('pool:', Date.now() - t1);

const t2 = Date.now();
const { initDb } = require('./server/src/db/init');
console.log('initDb loaded:', Date.now() - t2);

async function run() {
  const t3 = Date.now();
  try {
    await initDb();
    console.log('initDb executed:', Date.now() - t3);
  } catch (e) {
    console.error('initDb error:', e.message);
  }
  process.exit(0);
}

run();
