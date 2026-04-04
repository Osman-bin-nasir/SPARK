const performanceService = require('../services/performance.service');

async function getPerformance(req, res, next) {
  try {
    const result = await performanceService.getPerformance({
      organizationId: req.organization.id,
      query: req.query
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPerformance
};
