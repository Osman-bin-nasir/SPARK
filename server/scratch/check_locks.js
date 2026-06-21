const { pool } = require('../src/db/pool');

async function check() {
  try {
    const res = await pool.query(`
      SELECT pid, query, state, age(clock_timestamp(), query_start) as duration, wait_event_type, wait_event
      FROM pg_stat_activity
      WHERE state IS NOT NULL AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY duration DESC
    `);
    console.log('--- ACTIVE QUERIES ---');
    console.log(res.rows);
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await pool.end();
  }
}

check();
