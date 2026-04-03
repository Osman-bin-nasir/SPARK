const express = require('express');
const organizationController = require('../controllers/organization.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership, requireOrganizationRole(['founder']));

router.get('/team', organizationController.getTeam);
router.post('/team/join-code/regenerate', organizationController.regenerateJoinCode);

module.exports = router;
