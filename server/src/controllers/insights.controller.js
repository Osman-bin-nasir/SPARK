const insightsService = require('../services/insights.service');
const { HttpError } = require('../utils/http-error');

async function getInsights(req, res, next) {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      throw new HttpError(400, 'organization context is required');
    }

    const period = req.query.period || 'weekly';

    if (period === 'weekly') {
      const insights = await insightsService.getWeeklyInsights({ organizationId });
      res.status(200).json(insights);
    } else if (period === 'monthly') {
      const insights = await insightsService.getMonthlyInsights({ organizationId });
      res.status(200).json(insights);
    } else {
      throw new HttpError(400, 'period must be one of weekly or monthly');
    }
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInsights
};
