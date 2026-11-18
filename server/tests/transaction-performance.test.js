const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');

const { pool } = require('../src/db/pool');
const transactionsRepository = require('../src/db/transactions.repository');
const performanceIndexesMigration = require('../src/db/migrations/014_transaction_performance_indexes');

async function withQueryRecorder(fn) {
  const statements = [];
  const originalQuery = pool.query;

  pool.query = async (statement) => {
    statements.push(statement);
    return {
      rows: statement.includes('COUNT(*)') ? [{ count: 3 }] : [],
      rowCount: 0
    };
  };

  try {
    return await fn(statements);
  } finally {
    pool.query = originalQuery;
  }
}

test('transaction count query skips the approvals join when no approval filter is used', async () => {
  await withQueryRecorder(async (statements) => {
    await transactionsRepository.listTransactions({
      organizationId: 'org-1',
      page: 1,
      pageSize: 20
    });

    const countQuery = statements.find((statement) => statement.includes('COUNT(*)'));
    assert.ok(countQuery);
    assert.doesNotMatch(countQuery, /JOIN approvals/);
  });
});

test('transaction count query keeps the approvals join for approval-based filters', async () => {
  await withQueryRecorder(async (statements) => {
    await transactionsRepository.listTransactions({
      organizationId: 'org-1',
      page: 1,
      pageSize: 20,
      status: 'approved'
    });

    const countQuery = statements.find((statement) => statement.includes('COUNT(*)'));
    assert.ok(countQuery);
    assert.match(countQuery, /LEFT JOIN approvals/);
  });
});

test('transaction lists can skip the count query when only rows are needed', async () => {
  await withQueryRecorder(async (statements) => {
    const result = await transactionsRepository.listTransactions({
      organizationId: 'org-1',
      page: 1,
      pageSize: 10000,
      includeTotal: false
    });

    assert.equal(statements.filter((statement) => statement.includes('COUNT(*)')).length, 0);
    assert.equal(result.total, null);
  });
});

test('performance migration adds aggregate and pagination indexes', async () => {
  const db = new PGlite();

  try {
    await db.exec(`
      CREATE TABLE transactions (
        id UUID,
        organization_id UUID,
        transaction_type TEXT,
        transaction_date DATE,
        created_at TIMESTAMPTZ
      );
      CREATE INDEX idx_transactions_org_date ON transactions (organization_id, transaction_date DESC);
    `);

    await performanceIndexesMigration.up({ query: (statement) => db.exec(statement) });

    const { rows } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'transactions'`
    );
    const indexNames = rows.map((row) => row.indexname);

    assert.ok(indexNames.includes('idx_transactions_org_date_created'));
    assert.ok(indexNames.includes('idx_transactions_org_type_date'));
    assert.ok(!indexNames.includes('idx_transactions_org_date'));
  } finally {
    await db.close();
  }
});
