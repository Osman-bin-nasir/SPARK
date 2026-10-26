// Each lane is serial and uses a different database lock across API replicas.
// Replies remain responsive while one receipt and one Sheets sync are in flight.
function createAutomationRunner({ pool, jobs, processJob, onFailure, recoveryMs,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  const lanes = [
    { id: 1, kinds: ['inbound', 'insights'] },
    { id: 2, kinds: ['reply'] },
    { id: 3, kinds: ['sheets'] }
  ].map(lane => ({ ...lane, requested: false, running: null, timer: null, wakeAt: Infinity, cooldownUntil: 0 }));
  let stopped = true;
  let recoveryTimer;

  function later(lane, delay) {
    if (stopped) return;
    clearTimer(lane.timer);
    lane.wakeAt = Date.now() + delay;
    lane.timer = setTimer(() => wakeLane(lane), Math.max(0, Math.min(2147483647, delay)));
    lane.timer.unref?.();
  }

  async function drain(lane) {
    let client;
    let locked = false;
    let broken = false;
    const connectionError = () => { broken = true; };
    try {
      client = await pool.connect();
      client.on?.('error', connectionError);
      const { rows } = await client.query('SELECT pg_try_advisory_lock(73921, $1) AS locked', [lane.id]);
      locked = rows[0].locked;
      // Another replica is working. Retry contention, never poll an empty queue.
      if (!locked) return 5000;
      for (let count = 0; count < 10 && !stopped && !broken; count++) {
        const job = await jobs.claim(client, lane.kinds);
        if (!job) {
          const nextAt = await jobs.nextAvailable(client, lane.kinds);
          return nextAt ? Math.max(100, new Date(nextAt).getTime() - Date.now()) : null;
        }
        try {
          await processJob(job);
          await jobs.complete(job.id, client);
        } catch (error) {
          const status = Number(error.statusCode || error.status || error.response?.status || error.code);
          if (status === 429 || status === 503) {
            error.retryAfter = Math.max(Number(error.retryAfter) || 0,
              Number(error.response?.headers?.get?.('retry-after') || error.response?.headers?.['retry-after']) || 0, 60);
            lane.cooldownUntil = Date.now() + error.retryAfter * 1000;
          }
          await onFailure(job, error, client);
          if (lane.cooldownUntil > Date.now()) return lane.cooldownUntil - Date.now();
        }
      }
      return 0; // Yield to HTTP requests between bounded batches.
    } catch (_) {
      console.error('Automation lane failed; recovery scheduled.');
      return 60000;
    } finally {
      if (client) {
        try { if (locked && !broken) await client.query('SELECT pg_advisory_unlock(73921, $1)', [lane.id]); }
        catch (_) { broken = true; }
        client.removeListener?.('error', connectionError);
        client.release(broken);
      }
    }
  }

  function wakeLane(lane) {
    if (stopped) return;
    if (lane.cooldownUntil > Date.now()) {
      if (!lane.running) later(lane, lane.cooldownUntil - Date.now());
      return;
    }
    lane.requested = true;
    if (lane.running) return;
    clearTimer(lane.timer);
    lane.wakeAt = Infinity;
    lane.requested = false;
    const finished = delay => {
      lane.running = null;
      if (lane.cooldownUntil > Date.now()) later(lane, lane.cooldownUntil - Date.now());
      else if (lane.requested) later(lane, 0);
      else if (delay !== null) later(lane, delay);
    };
    lane.running = drain(lane).then(finished, () => finished(60000));
  }

  function wake(kind, dueAt) {
    const due = dueAt ? new Date(dueAt).getTime() : 0;
    for (const lane of lanes) {
      if (kind && !lane.kinds.includes(kind)) continue;
      // A newly queued delayed sync can arm its timer directly. A receipt burst
      // does not trigger repeated empty queue checks or postpone that deadline.
      if (due > Date.now() && !lane.running) {
        if (due < lane.wakeAt) later(lane, due - Date.now());
      } else wakeLane(lane);
    }
  }

  function recover() {
    if (stopped) return;
    wake();
    recoveryTimer = setTimer(recover, recoveryMs);
    recoveryTimer.unref?.();
  }

  return {
    wake,
    start() { if (stopped) { stopped = false; recover(); } },
    async stop() {
      stopped = true;
      clearTimer(recoveryTimer);
      for (const lane of lanes) clearTimer(lane.timer);
      await Promise.all(lanes.map(lane => lane.running));
    }
  };
}

module.exports = { createAutomationRunner };
