const test = require('node:test');
const assert = require('node:assert/strict');

const transactionService = require('../src/services/transaction.service');
const transactionsRepository = require('../src/db/transactions.repository');
const { pool } = require('../src/db/pool');

const originalPoolConnect = pool.connect;
const originalFindTransactionById = transactionsRepository.findTransactionById;
const originalUpdateTransaction = transactionsRepository.updateTransaction;
const originalDeleteTransaction = transactionsRepository.deleteTransaction;
const originalUpsertApproval = transactionsRepository.upsertApproval;
const originalDeleteApproval = transactionsRepository.deleteApproval;
const originalInsertAuditLog = transactionsRepository.insertAuditLog;
const originalUpsertEmbeddingJob = transactionsRepository.upsertEmbeddingJob;

test.afterEach(() => {
  pool.connect = originalPoolConnect;
  transactionsRepository.findTransactionById = originalFindTransactionById;
  transactionsRepository.updateTransaction = originalUpdateTransaction;
  transactionsRepository.deleteTransaction = originalDeleteTransaction;
  transactionsRepository.upsertApproval = originalUpsertApproval;
  transactionsRepository.deleteApproval = originalDeleteApproval;
  transactionsRepository.insertAuditLog = originalInsertAuditLog;
  transactionsRepository.upsertEmbeddingJob = originalUpsertEmbeddingJob;
});

function createMockClient() {
  const statements = [];

  return {
    statements,
    async query(statement) {
      statements.push(statement);
      return { rows: [] };
    },
    release() {}
  };
}

test('updateTransaction stores a manual approval when status is approved', async () => {
  const client = createMockClient();
  pool.connect = async () => client;

  const existingTransaction = {
    id: 'tx-1',
    organization_id: 'org-1',
    amount: 560,
    vendor: 'CyberSure Insurance',
    transaction_type: 'expense',
    category: 'insurance',
    transaction_date: '2026-04-07',
    confidence_score: 0.76,
    duplicate_of_transaction_id: null,
    duplicate_score: null,
    status: 'pending_review',
    review_status: 'pending_review',
    created_at: '2026-04-07T13:30:00.000Z',
    approval: null
  };

  const approvedTransaction = {
    ...existingTransaction,
    status: 'auto_verified',
    review_status: 'approved',
    approval: {
      id: 'approval-1',
      approved_by: 'user-1',
      approved_at: '2026-04-08T11:00:00.000Z'
    }
  };

  let findTransactionCallCount = 0;
  transactionsRepository.findTransactionById = async () => {
    findTransactionCallCount += 1;
    return findTransactionCallCount === 1 ? existingTransaction : approvedTransaction;
  };

  let updateArgs = null;
  transactionsRepository.updateTransaction = async (args) => {
    updateArgs = args;
    return {
      ...existingTransaction,
      ...args.changes
    };
  };

  let approvalArgs = null;
  transactionsRepository.upsertApproval = async (args) => {
    approvalArgs = args;
    return {
      id: 'approval-1',
      transaction_id: args.transactionId,
      approved_by: args.approvedBy,
      approved_at: args.approvedAt
    };
  };

  transactionsRepository.deleteApproval = async () => {
    throw new Error('deleteApproval should not run when approving a transaction');
  };

  let auditLogArgs = null;
  transactionsRepository.insertAuditLog = async (args) => {
    auditLogArgs = args;
  };

  transactionsRepository.upsertEmbeddingJob = async () => {
    throw new Error('upsertEmbeddingJob should not run for a status-only approval');
  };

  const result = await transactionService.updateTransaction({
    organizationId: 'org-1',
    transactionId: 'tx-1',
    userId: 'user-1',
    payload: {
      status: 'approved'
    }
  });

  assert.equal(updateArgs.organizationId, 'org-1');
  assert.equal(updateArgs.transactionId, 'tx-1');
  assert.equal(updateArgs.changes.status, 'auto_verified');
  assert.equal(approvalArgs.transactionId, 'tx-1');
  assert.equal(approvalArgs.approvedBy, 'user-1');
  assert.equal(typeof approvalArgs.approvedAt, 'string');
  assert.equal(auditLogArgs.previousValue.review_status, 'pending_review');
  assert.equal(auditLogArgs.newValue.review_status, 'approved');
  assert.equal(result.review_status, 'approved');
  assert.deepEqual(client.statements, ['BEGIN', 'COMMIT']);
});

test('updateTransaction clears the approval record when sending a transaction back to pending review', async () => {
  const client = createMockClient();
  pool.connect = async () => client;

  const approvedTransaction = {
    id: 'tx-2',
    organization_id: 'org-1',
    amount: 1200,
    vendor: 'AWS',
    transaction_type: 'expense',
    category: 'cloud',
    transaction_date: '2026-04-09',
    confidence_score: 0.91,
    duplicate_of_transaction_id: null,
    duplicate_score: null,
    status: 'auto_verified',
    review_status: 'approved',
    created_at: '2026-04-09T09:15:00.000Z',
    approval: {
      id: 'approval-2',
      approved_by: 'user-1',
      approved_at: '2026-04-09T10:00:00.000Z'
    }
  };

  const pendingTransaction = {
    ...approvedTransaction,
    status: 'pending_review',
    review_status: 'pending_review',
    approval: null
  };

  let findTransactionCallCount = 0;
  transactionsRepository.findTransactionById = async () => {
    findTransactionCallCount += 1;
    return findTransactionCallCount === 1 ? approvedTransaction : pendingTransaction;
  };

  let updateArgs = null;
  transactionsRepository.updateTransaction = async (args) => {
    updateArgs = args;
    return {
      ...approvedTransaction,
      ...args.changes
    };
  };

  transactionsRepository.upsertApproval = async () => {
    throw new Error('upsertApproval should not run when sending back to pending review');
  };

  let deleteArgs = null;
  transactionsRepository.deleteApproval = async (args) => {
    deleteArgs = args;
  };

  let auditLogArgs = null;
  transactionsRepository.insertAuditLog = async (args) => {
    auditLogArgs = args;
  };

  transactionsRepository.upsertEmbeddingJob = async () => {
    throw new Error('upsertEmbeddingJob should not run for a status-only review change');
  };

  const result = await transactionService.updateTransaction({
    organizationId: 'org-1',
    transactionId: 'tx-2',
    userId: 'user-1',
    payload: {
      status: 'pending_review'
    }
  });

  assert.equal(updateArgs.changes.status, 'pending_review');
  assert.deepEqual(deleteArgs, { transactionId: 'tx-2' });
  assert.equal(auditLogArgs.previousValue.review_status, 'approved');
  assert.equal(auditLogArgs.newValue.review_status, 'pending_review');
  assert.equal(result.review_status, 'pending_review');
  assert.deepEqual(client.statements, ['BEGIN', 'COMMIT']);
});

test('deleteTransaction removes a duplicate transaction', async () => {
  const client = createMockClient();
  pool.connect = async () => client;

  const existingTransaction = {
    id: 'tx-3',
    organization_id: 'org-1',
    amount: 10,
    vendor: 'Unknown',
    transaction_type: 'expense',
    category: 'expense',
    transaction_date: '2026-04-08',
    confidence_score: 0.9,
    duplicate_of_transaction_id: 'tx-master',
    duplicate_score: 1,
    status: 'pending_review',
    review_status: 'pending_review',
    created_at: '2026-04-10T06:59:14.000Z',
    approval: null
  };

  transactionsRepository.findTransactionById = async () => existingTransaction;

  let deleteArgs = null;
  transactionsRepository.deleteTransaction = async (args) => {
    deleteArgs = args;
    return existingTransaction;
  };

  const result = await transactionService.deleteTransaction({
    organizationId: 'org-1',
    transactionId: 'tx-3'
  });

  assert.deepEqual(deleteArgs, {
    organizationId: 'org-1',
    transactionId: 'tx-3'
  });
  assert.equal(result.id, 'tx-3');
  assert.deepEqual(client.statements, ['BEGIN', 'COMMIT']);
});
