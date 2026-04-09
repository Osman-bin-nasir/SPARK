const dashboardService = require('../services/dashboard.service');

async function getDashboard(req, res, next) {
  try {
    const result = await dashboardService.getDashboardSnapshot({
      organization: req.organization,
      query: req.query
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getConfig(req, res, next) {
  try {
    const result = await dashboardService.getFinanceConfig({
      organizationId: req.organization.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function updateConfig(req, res, next) {
  try {
    const result = await dashboardService.updateFinanceConfig({
      organizationId: req.organization.id,
      payload: req.body
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function listBudgets(req, res, next) {
  try {
    const result = await dashboardService.listCategoryBudgets({
      organizationId: req.organization.id
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function replaceBudgets(req, res, next) {
  try {
    const result = await dashboardService.replaceCategoryBudgets({
      organizationId: req.organization.id,
      payload: req.body
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getConfig,
  getDashboard,
  listBudgets,
  replaceBudgets,
  updateConfig
};
