const t0 = Date.now();
require('dotenv').config();
console.log('dotenv:', Date.now() - t0);

const t1 = Date.now();
const { pool } = require('./src/db/pool');
console.log('pool:', Date.now() - t1);

const t2 = Date.now();
const { assertDatabaseReady } = require('./src/db/init');
console.log('assertDatabaseReady loaded:', Date.now() - t2);

async function run() {
  const t3 = Date.now();
  try {
    await assertDatabaseReady();
    console.log('assertDatabaseReady executed:', Date.now() - t3);
  } catch (e) {
    console.error('assertDatabaseReady error:', e.message);
  }
  await pool.end();
  process.exit(0);
}

run();
