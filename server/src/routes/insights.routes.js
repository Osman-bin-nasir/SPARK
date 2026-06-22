const express = require('express');
const insightsController = require('../controllers/insights.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');
const { env } = require('../config/env');
const crypto = require('crypto');

const router = express.Router();

// Custom dual auth middleware
router.use((req, res, next) => {
  const signature = req.get('x-spark-signature');
  const orgId = req.get('x-organization-id');

  if (signature && orgId) {
    const period = req.query.period || 'weekly';
    const payload = `${orgId}:${period}`;
    const expected = crypto
      .createHmac('sha256', env.webhookSecret)
      .update(payload)
      .digest('hex');

    const received = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');

    if (expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      // Set organization context directly and bypass standard auth
      req.organization = { id: orgId };
      next();
      return;
    }
  }

  // Fallback to standard user auth
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    requireOrganizationMembership(req, res, next);
  });
});

router.get('/', insightsController.getInsights);

module.exports = router;
