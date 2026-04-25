const express = require('express');
const semanticSearchController = require('../controllers/semantic-search.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');
const { createSearchMetricsMiddleware } = require('../middleware/search-metrics.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);
router.post('/', createSearchMetricsMiddleware('/api/semantic-search'), semanticSearchController.search);

module.exports = router;
