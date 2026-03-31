const express = require('express');
const googleDriveController = require('../controllers/google-drive.controller');
const { optionalAuth, requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');

const router = express.Router();

router.get('/connect', optionalAuth, googleDriveController.connect);
router.get('/callback', googleDriveController.callback);
router.post(
  '/connect-url',
  requireAuth,
  requireOrganizationMembership,
  requireOrganizationRole(['founder', 'admin']),
  googleDriveController.connectUrl
);
router.get(
  '/status',
  requireAuth,
  requireOrganizationMembership,
  requireOrganizationRole(['founder', 'admin']),
  googleDriveController.status
);

module.exports = router;
