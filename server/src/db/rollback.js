// Return an error to pass to pg's release(error), which discards a broken client.
async function rollbackSafely(client) {
  try {
    await client.query('ROLLBACK');
    return null;
  } catch (error) {
    // Do not log SQL, connection strings, or transaction payloads.
    console.error('Database rollback failed; discarding connection.');
    return error;
  }
}

module.exports = { rollbackSafely };
