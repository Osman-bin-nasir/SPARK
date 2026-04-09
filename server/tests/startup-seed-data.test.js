const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REFERENCE_DATE,
  buildStartupSeedPlan
} = require('../src/db/startup-seed-data');

test('startup seed plan covers six months and keeps monthly outflow below $1000', () => {
  const plan = buildStartupSeedPlan({ referenceDate: DEFAULT_REFERENCE_DATE });

  assert.equal(plan.summary.monthly_usage.length, 6);

  plan.summary.monthly_usage.forEach((month) => {
    assert.ok(
      month.outflow_total < 1000,
      `Expected ${month.month} outflow to stay below 1000, got ${month.outflow_total}`
    );
  });
});

test('startup seed plan populates review, ingestion, and embedding flows', () => {
  const plan = buildStartupSeedPlan({ referenceDate: DEFAULT_REFERENCE_DATE });
  const embeddingStatuses = new Set(plan.records.map((record) => record.embedding_job.status));
  const ingestionStatuses = new Set(plan.extra_ingestion_jobs.map((job) => job.status));
  const orphanStatuses = new Set(plan.orphan_drive_files.map((file) => file.cleanup_status));

  assert.ok(plan.records.some((record) => record.transaction.status === 'pending_review'));
  assert.ok(plan.records.some((record) => record.approval));
  assert.ok(plan.records.some((record) => record.transaction.duplicate_of_transaction_id));
  assert.ok(embeddingStatuses.has('completed'));
  assert.ok(embeddingStatuses.has('failed'));
  assert.ok(embeddingStatuses.has('pending'));
  assert.ok(embeddingStatuses.has('processing'));
  assert.ok(ingestionStatuses.has('failed'));
  assert.ok(ingestionStatuses.has('processing'));
  assert.deepEqual(orphanStatuses, new Set(['failed', 'deleted', 'pending']));
});
