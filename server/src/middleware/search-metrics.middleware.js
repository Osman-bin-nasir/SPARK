const { recordSearchMetric } = require('../services/search-metrics.service');

function createSearchMetricsMiddleware(routeKey) {
  return function captureSearchMetrics(req, res, next) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      recordSearchMetric({
        routeKey,
        durationMs,
        statusCode: res.statusCode
      });
    });

    next();
  };
}

module.exports = {
  createSearchMetricsMiddleware
};
