const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
env.jwtSecret = 'integration-test-access-secret';

const app = require('../src/app');
const organizationsRepository = require('../src/db/organizations.repository');
const transactionService = require('../src/services/transaction.service');
const { signAccessToken } = require('../src/utils/jwt');

const originalFindMembership = organizationsRepository.findMembership;
const originalListTransactions = transactionService.listTransactions;
const originalCreateTransaction = transactionService.createTransaction;
const originalJwtSecret = env.jwtSecret;

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  env.jwtSecret = originalJwtSecret;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test.afterEach(() => {
  organizationsRepository.findMembership = originalFindMembership;
  transactionService.listTransactions = originalListTransactions;
  transactionService.createTransaction = originalCreateTransaction;
});

function accessToken() {
  return signAccessToken({ id: 'user-1', email: 'owner@example.com' }, {
    organizationId: 'org-1',
    expiresIn: '5m'
  });
}

function stubMembership(role = 'admin') {
  organizationsRepository.findMembership = async ({ userId, organizationId }) => {
    assert.equal(userId, 'user-1');
    assert.equal(organizationId, 'org-1');
    return {
      organization_id: 'org-1',
      organization_name: 'Test Org',
      role
    };
  };
}

test('health and unknown routes expose the expected HTTP contract', async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok' });

  const missingResponse = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: 'Route not found' });
});

test('protected transaction routes reject requests without a bearer token', async () => {
  const response = await fetch(`${baseUrl}/api/transactions`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});

test('authenticated transaction listing passes organization and query context through the route stack', async () => {
  stubMembership('member');
  let serviceArgs = null;
  transactionService.listTransactions = async (args) => {
    serviceArgs = args;
    return { items: [{ id: 'tx-1' }], total: 1 };
  };

  const response = await fetch(`${baseUrl}/api/transactions?limit=25&status=pending_review`, {
    headers: { authorization: `Bearer ${accessToken()}` }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [{ id: 'tx-1' }], total: 1 });
  assert.deepEqual(serviceArgs, {
    organizationId: 'org-1',
    query: { limit: '25', status: 'pending_review' }
  });
});

test('transaction creation enforces organization roles before invoking business logic', async () => {
  stubMembership('member');
  transactionService.createTransaction = async () => {
    throw new Error('service must not be called for an unauthorized member');
  };

  const response = await fetch(`${baseUrl}/api/transactions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken()}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ amount: 42 })
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to perform this action'
  });
});

test('authorized transaction creation reaches the controller and returns a created response', async () => {
  stubMembership('admin');
  let serviceArgs = null;
  transactionService.createTransaction = async (args) => {
    serviceArgs = args;
    return { id: 'tx-created', ...args.payload };
  };

  const payload = { amount: 42, vendor: 'Example Co' };
  const response = await fetch(`${baseUrl}/api/transactions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken()}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 'tx-created', ...payload });
  assert.deepEqual(serviceArgs, {
    organizationId: 'org-1',
    userId: 'user-1',
    payload
  });
});
