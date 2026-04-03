const express = require('express');
const semanticSearchController = require('../controllers/semantic-search.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);
router.post('/', semanticSearchController.search);

module.exports = router;
