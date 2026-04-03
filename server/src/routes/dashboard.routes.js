const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

router.get('/', dashboardController.getDashboard);
router.get('/config', dashboardController.getConfig);
router.put('/config', requireOrganizationRole(['founder', 'admin']), dashboardController.updateConfig);
router.get('/budgets', dashboardController.listBudgets);
router.put('/budgets', requireOrganizationRole(['founder', 'admin']), dashboardController.replaceBudgets);

module.exports = router;
