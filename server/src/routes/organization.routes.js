const express = require('express');
const organizationController = require('../controllers/organization.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');

const router = express.Router();

// All organization routes require authentication and membership context
router.use(requireAuth, requireOrganizationMembership);

// 1. Settings and member details can be updated by founder, co-founder, or admin
router.patch('/', requireOrganizationRole(['founder', 'co-founder', 'admin']), organizationController.updateSettings);
router.patch('/team/members/:userId', requireOrganizationRole(['founder', 'co-founder', 'admin']), organizationController.updateMember);

// 2. Team management and join-code regeneration remain founder and co-founder only
router.use(requireOrganizationRole(['founder', 'co-founder']));

router.get('/team', organizationController.getTeam);
router.post('/team/join-code/regenerate', organizationController.regenerateJoinCode);

router.post('/team/members', organizationController.addMember);
router.delete('/team/members/:userId', organizationController.removeMember);
router.patch('/team/members/:userId/role', organizationController.updateMemberRole);

module.exports = router;
