import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormState, buildTransactionPayload } from '../src/lib/approval-form.js';

const cached = { id: 'receipt', vendor: 'Cached vendor', category: 'food', amount: 10, transaction_date: '2026-10-28' };
const refreshed = { ...cached, vendor: 'Updated vendor', category: 'travel', amount: 25, transaction_date: '2026-10-29' };

test('refreshing an untouched approval uses current values without generating edits', () => {
  const form = buildFormState(refreshed);
  assert.deepEqual(form, { vendor: 'Updated vendor', category: 'travel', amount: '25', transaction_date: '2026-10-29' });
  assert.deepEqual(buildTransactionPayload(form, refreshed), {});
});

test('refreshing an approval preserves each edited field while merging untouched fields', () => {
  const edits = { vendor: 'Reviewer correction', amount: '40' };
  assert.equal(buildFormState(cached, edits).vendor, edits.vendor);
  const form = buildFormState(refreshed, edits);
  assert.equal(form.category, 'travel');
  assert.equal(form.transaction_date, '2026-10-29');
  assert.deepEqual(buildTransactionPayload(form, refreshed), { vendor: 'Reviewer correction', amount: 40 });
  assert.deepEqual({ ...buildTransactionPayload(form, refreshed), status: 'approved' }, {
    vendor: 'Reviewer correction', amount: 40, status: 'approved'
  });
});

test('intentional edits equal to cached values stay dirty and empty edits remain visible', () => {
  const form = buildFormState(refreshed, { vendor: cached.vendor, category: '' });
  assert.equal(form.category, '');
  assert.deepEqual(buildTransactionPayload(form, refreshed), { vendor: cached.vendor });
});
