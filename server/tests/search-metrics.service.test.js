const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSearchMetricsSnapshot,
  recordSearchMetric,
  resetSearchMetrics
} = require('../src/services/search-metrics.service');

test('search metrics aggregate counts and latency percentiles per route', () => {
  resetSearchMetrics();

  recordSearchMetric({ routeKey: '/api/rag/answer', durationMs: 20, statusCode: 200 });
  recordSearchMetric({ routeKey: '/api/rag/answer', durationMs: 60, statusCode: 200 });
  recordSearchMetric({ routeKey: '/api/rag/answer', durationMs: 100, statusCode: 503 });

  const snapshot = getSearchMetricsSnapshot();
  const metric = snapshot.routes.find((route) => route.route === '/api/rag/answer');

  assert.equal(snapshot.route_count, 1);
  assert.ok(metric);
  assert.equal(metric.request_count, 3);
  assert.equal(metric.success_count, 2);
  assert.equal(metric.error_count, 1);
  assert.equal(metric.avg_duration_ms, 60);
  assert.equal(metric.p50_duration_ms, 60);
  assert.equal(metric.p95_duration_ms, 100);
  assert.equal(metric.max_duration_ms, 100);
});

test.afterEach(() => {
  resetSearchMetrics();
});
