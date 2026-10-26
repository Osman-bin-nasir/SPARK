const { EventEmitter } = require('node:events');

// Emit transactional wakeups only after COMMIT. No idle database connection.
module.exports = new EventEmitter();
