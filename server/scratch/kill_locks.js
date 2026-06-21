const { pool } = require('../src/db/pool');

async function kill() {
  try {
    // Kill PIDs that are idle in transaction or blocking
    const pids = [9488, 9501];
    for (const pid of pids) {
      console.log(`Terminating backend PID ${pid}...`);
      const res = await pool.query('SELECT pg_terminate_backend($1)', [pid]);
      console.log(`PID ${pid} termination result:`, res.rows[0]);
    }
  } catch (err) {
    console.error('Termination failed:', err);
  } finally {
    await pool.end();
  }
}

kill();
