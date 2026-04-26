const MAX_SAMPLES_PER_ROUTE = 500;
const routeMetrics = new Map();

function ensureRouteMetric(routeKey) {
  if (!routeMetrics.has(routeKey)) {
    routeMetrics.set(routeKey, {
      route: routeKey,
      request_count: 0,
      success_count: 0,
      error_count: 0,
      total_duration_ms: 0,
      max_duration_ms: 0,
      durations_ms: [],
      last_seen_at: null
    });
  }

  return routeMetrics.get(routeKey);
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}

function recordSearchMetric({ routeKey, durationMs, statusCode }) {
  const metric = ensureRouteMetric(routeKey);
  const normalizedDurationMs = Number.isFinite(durationMs) ? Math.max(0, Number(durationMs.toFixed(3))) : 0;
  const normalizedStatusCode = Number.isInteger(statusCode) ? statusCode : 500;

  metric.request_count += 1;
  metric.total_duration_ms += normalizedDurationMs;
  metric.max_duration_ms = Math.max(metric.max_duration_ms, normalizedDurationMs);
  metric.last_seen_at = new Date().toISOString();

  if (normalizedStatusCode >= 500) {
    metric.error_count += 1;
  } else {
    metric.success_count += 1;
  }

  metric.durations_ms.push(normalizedDurationMs);

  if (metric.durations_ms.length > MAX_SAMPLES_PER_ROUTE) {
    metric.durations_ms.shift();
  }
}

function getSearchMetricsSnapshot() {
  const routes = [...routeMetrics.values()]
    .map((metric) => {
      const sortedDurations = [...metric.durations_ms].sort((left, right) => left - right);
      const averageDuration = metric.request_count > 0
        ? Number((metric.total_duration_ms / metric.request_count).toFixed(3))
        : 0;

      return {
        route: metric.route,
        request_count: metric.request_count,
        success_count: metric.success_count,
        error_count: metric.error_count,
        avg_duration_ms: averageDuration,
        p50_duration_ms: percentile(sortedDurations, 0.5),
        p95_duration_ms: percentile(sortedDurations, 0.95),
        max_duration_ms: metric.max_duration_ms,
        last_seen_at: metric.last_seen_at
      };
    })
    .sort((left, right) => left.route.localeCompare(right.route));

  return {
    generated_at: new Date().toISOString(),
    route_count: routes.length,
    routes
  };
}

function resetSearchMetrics() {
  routeMetrics.clear();
}

module.exports = {
  getSearchMetricsSnapshot,
  recordSearchMetric,
  resetSearchMetrics
};
