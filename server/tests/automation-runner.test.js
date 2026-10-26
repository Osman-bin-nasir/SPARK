const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutomationRunner } = require('../src/services/automation-runner');

async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Runner did not settle');
}

function fixture(processJob = async () => {}, onFailure = async () => assert.fail('Unexpected failure')) {
  const timers = new Set();
  const pending = [];
  const completed = [];
  let connections = 0;
  let releases = 0;
  const jobs = {
    claim: async (_client, kinds) => {
      const index = pending.findIndex(job => kinds.includes(job.kind));
      return index < 0 ? null : pending.splice(index, 1)[0];
    },
    nextAvailable: async () => null,
    complete: async id => completed.push(id)
  };
  const runner = createAutomationRunner({
    pool: { connect: async () => {
      connections++;
      return { query: async () => ({ rows: [{ locked: true }] }), release: () => releases++ };
    } },
    jobs, processJob, onFailure, recoveryMs: 3600000,
    setTimer: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; },
    clearTimer: timer => timers.delete(timer)
  });
  function fire(delay) {
    for (const timer of [...timers]) if (timer.delay <= delay) { timers.delete(timer); timer.fn(); }
  }
  return { runner, jobs, pending, completed, timers, fire,
    get connections() { return connections; }, get releases() { return releases; } };
}

test('empty lanes stop querying; only the hourly recovery timer remains', async () => {
  const f = fixture();
  f.runner.start();
  await settle(() => f.releases === 3);
  assert.deepEqual([...f.timers].map(timer => timer.delay), [3600000]);
  f.fire(60000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.connections, 3);
  f.pending.push({ id: 'new-receipt', kind: 'inbound' });
  f.runner.wake('inbound');
  await settle(() => f.completed.includes('new-receipt') && f.releases === 4);
  assert.equal(f.connections, 4);
  assert.deepEqual([...f.timers].map(timer => timer.delay), [3600000]);
  await f.runner.stop();
  assert.equal(f.timers.size, 0);
});

test('replies and Sheets can finish while a receipt provider call is blocked', async () => {
  let finishReceipt;
  const blocked = new Promise(resolve => { finishReceipt = resolve; });
  const f = fixture(async job => { if (job.kind === 'inbound') await blocked; });
  f.pending.push({ id: 'receipt', kind: 'inbound' });
  f.runner.start();
  await settle(() => f.releases === 2);
  f.pending.push({ id: 'reply', kind: 'reply' }, { id: 'sheet', kind: 'sheets' });
  f.runner.wake('reply');
  f.runner.wake('sheets');
  await settle(() => f.completed.length === 2);
  assert.ok(!f.completed.includes('receipt'));
  finishReceipt();
  await settle(() => f.completed.includes('receipt'));
  await f.runner.stop();
});

test('delayed work arms a due-time timer without five-second polling', async () => {
  const f = fixture();
  f.jobs.nextAvailable = async (_client, kinds) => kinds.includes('sheets') ? new Date(Date.now() + 30000) : null;
  f.runner.start();
  await settle(() => f.releases === 3);
  assert.equal(f.timers.size, 2);
  const due = [...f.timers].find(timer => timer.delay < 3600000);
  assert.ok(due.delay >= 29000 && due.delay <= 30000);
  await f.runner.stop();
});

test('delayed enqueue notifications arm the first deadline without extra database reads', async () => {
  const f = fixture();
  f.runner.start();
  await settle(() => f.releases === 3);
  const dueAt = new Date(Date.now() + 30000);
  f.runner.wake('sheets', dueAt);
  for (let i = 0; i < 30; i++) f.runner.wake('sheets', new Date(dueAt.getTime() + 1000));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.connections, 3);
  assert.equal(f.timers.size, 2);
  assert.ok([...f.timers].some(timer => timer.delay >= 29000 && timer.delay <= 30000));
  await f.runner.stop();
});

test('a wakeup racing with the final empty check is not lost', async () => {
  const f = fixture();
  let finishCheck;
  let checked = false;
  f.jobs.nextAvailable = async (_client, kinds) => {
    if (!kinds.includes('inbound') || checked) return null;
    checked = true;
    return new Promise(resolve => { finishCheck = resolve; });
  };
  f.runner.start();
  await settle(() => Boolean(finishCheck));
  f.pending.push({ id: 'racing-receipt', kind: 'inbound' });
  f.runner.wake('inbound');
  finishCheck(null);
  await settle(() => [...f.timers].some(timer => timer.delay === 0));
  f.fire(0);
  await settle(() => f.completed.includes('racing-receipt'));
  await f.runner.stop();
});

test('provider rate limits pause the lane; new messages cannot bypass Retry-After', async () => {
  let failures = 0;
  const f = fixture(async () => { throw Object.assign(new Error('rate limited'), { status: 429, retryAfter: 120 }); },
    async (_job, error) => { failures++; assert.equal(error.retryAfter, 120); });
  f.pending.push({ id: 'limited', kind: 'inbound' }, { id: 'waiting', kind: 'inbound' });
  f.runner.start();
  await settle(() => f.releases === 3);
  assert.equal(failures, 1);
  for (let i = 0; i < 20; i++) f.runner.wake('inbound');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.connections, 3);
  assert.equal(f.pending.length, 1);
  assert.ok([...f.timers].some(timer => timer.delay > 119000 && timer.delay <= 120000));
  await f.runner.stop();
});
