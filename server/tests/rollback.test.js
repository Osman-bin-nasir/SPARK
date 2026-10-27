const test = require('node:test');
const assert = require('node:assert/strict');
const { rollbackSafely } = require('../src/db/rollback');
const { pool } = require('../src/db/pool');
const invitations = require('../src/db/invitations.repository');
const users = require('../src/db/users.repository');
const auth = require('../src/services/auth.service');
const service = require('../src/services/invitation.service');

test('successful rollback leaves the connection reusable', async () => {
  const queries = [];
  assert.equal(await rollbackSafely({ query: async sql => { queries.push(sql); } }), null);
  assert.deepEqual(queries, ['ROLLBACK']);
});

test('failed rollback is reported without logging connection or transaction details', async t => {
  const failure = new Error('private connection details');
  const logged = t.mock.method(console, 'error', () => {});
  assert.equal(await rollbackSafely({ query: async () => { throw failure; } }), failure);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(logged.mock.calls[0].arguments.join(' ').includes(failure.message), false);
});

function brokenTransaction(t) {
  const originalFailure = new Error('original transaction failure');
  const rollbackFailure = new Error('connection reset during rollback');
  const released = [];
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'connect', async () => ({
    query: async sql => {
      if (sql === 'ROLLBACK') throw rollbackFailure;
      return { rows: [] };
    },
    release: error => released.push(error)
  }));
  return { originalFailure, rollbackFailure, released };
}

test('invitation failure preserves its original error and discards the broken connection', async t => {
  const { originalFailure, rollbackFailure, released } = brokenTransaction(t);
  t.mock.method(invitations, 'findActive', async () => { throw originalFailure; });
  await assert.rejects(() => service.joinInvitation({ token: 'a'.repeat(43), email: 'invited@example.test' }), error => error === originalFailure);
  assert.deepEqual(released, [rollbackFailure]);
});

test('workspace registration failure preserves its original error and discards the broken connection', async t => {
  const { originalFailure, rollbackFailure, released } = brokenTransaction(t);
  t.mock.method(users, 'findUserByEmail', async () => null);
  t.mock.method(users, 'createUser', async () => { throw originalFailure; });
  await assert.rejects(() => auth.register({ email: 'owner@example.test', password: 'test-password', organization_name: 'My workspace' }), error => error === originalFailure);
  assert.deepEqual(released, [rollbackFailure]);
});
