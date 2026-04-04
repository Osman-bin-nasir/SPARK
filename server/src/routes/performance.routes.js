const express = require('express');
const performanceController = require('../controllers/performance.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

router.get('/', performanceController.getPerformance);

module.exports = router;
