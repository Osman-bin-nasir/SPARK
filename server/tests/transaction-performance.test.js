const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');

const { pool } = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');
const { migrations } = require('../src/db/migrations');
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
    assert.match(statements[0], /ORDER BY t\.transaction_date DESC, t\.created_at DESC, t\.id DESC/);
  });
});

test('transaction count query keeps the approvals join for approval-based filters', async () => {
  await withQueryRecorder(async (statements) => {
    for (const status of ['approved', 'auto_verified']) {
      const start = statements.length;
      await transactionsRepository.listTransactions({ organizationId: 'org-1', status });

      const countQuery = statements[start + 1];
      assert.match(countQuery, /COUNT\(\*\)/);
      assert.match(countQuery, /LEFT JOIN approvals/);
      assert.match(countQuery, status === 'approved' ? /a\.id IS NOT NULL/ : /a\.id IS NULL/);
    }
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

test('performance migration repairs interrupted index builds and is safe to rerun', async (t) => {
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
      CREATE INDEX idx_transactions_org_type_date ON transactions (organization_id);
      UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'idx_transactions_org_type_date'::regclass;
      CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    `);

    for (const migration of migrations.filter((item) => item !== performanceIndexesMigration)) {
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
    }

    t.mock.method(pool, 'connect', async () => ({
      query: (statement, params) => db.query(statement, params),
      release: (destroy) => {
        assert.equal(destroy, true);
        return db.query('SELECT pg_advisory_unlock_all()');
      }
    }));

    const result = await runMigrations();
    assert.deepEqual(result.executed_migrations, [performanceIndexesMigration.name]);
    assert.deepEqual((await runMigrations()).executed_migrations, []);

    const { rows } = await db.query(
      `SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       WHERE i.indrelid = 'transactions'::regclass
       ORDER BY c.relname`
    );
    assert.deepEqual(rows.map((row) => [row.relname, row.indisvalid]), [
      ['idx_transactions_org_date_created', true],
      ['idx_transactions_org_type_date', true]
    ]);
    assert.match(rows[0].definition, /\(organization_id, transaction_date DESC, created_at DESC, id DESC\)/);
    assert.match(rows[1].definition, /\(organization_id, transaction_type, transaction_date\)/);
  } finally {
    await db.close();
  }
});
