const { getSearchMetricsSnapshot } = require('../services/search-metrics.service');

function getSearchMetrics(_req, res) {
  res.status(200).json(getSearchMetricsSnapshot());
}

module.exports = {
  getSearchMetrics
};
