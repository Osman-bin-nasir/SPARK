import test from 'node:test';
import assert from 'node:assert/strict';

import { pageCache } from '../src/services/page-cache.js';

test.afterEach(() => {
  pageCache.bustNs('test');
});

test('page cache returns fresh data and retains metadata for stale-while-revalidate callers', () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    const data = { total: 42 };
    pageCache.set('test', 'dashboard', data);

    assert.deepEqual(pageCache.getFresh('test', 'dashboard'), data);
    assert.deepEqual(pageCache.get('test', 'dashboard'), { data, ts: 1_000 });
    assert.equal(pageCache.isStale('test', 'dashboard'), false);

    now += 60_001;

    assert.equal(pageCache.getFresh('test', 'dashboard'), null);
    assert.equal(pageCache.isStale('test', 'dashboard'), true);
    assert.deepEqual(pageCache.get('test', 'dashboard'), { data, ts: 1_000 });
  } finally {
    Date.now = realNow;
  }
});

test('page cache invalidates individual keys and entire namespaces', () => {
  pageCache.set('test', 'one', 1);
  pageCache.set('test', 'two', 2);
  pageCache.set('other', 'one', 3);

  pageCache.bust('test', 'one');
  assert.equal(pageCache.get('test', 'one'), null);
  assert.equal(pageCache.getFresh('test', 'two'), 2);

  pageCache.bustNs('test');
  assert.equal(pageCache.get('test', 'two'), null);
  assert.equal(pageCache.getFresh('other', 'one'), 3);

  pageCache.bustNs('other');
});
