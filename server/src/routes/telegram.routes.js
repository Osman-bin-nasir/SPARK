const express = require('express');
const telegramController = require('../controllers/telegram.controller');
const { verifySignedJsonWebhookWithoutOrganization } = require('../middleware/webhook.middleware');

const router = express.Router();

router.post('/join-by-code', verifySignedJsonWebhookWithoutOrganization, telegramController.joinByCode);
router.post('/memberships', verifySignedJsonWebhookWithoutOrganization, telegramController.memberships);

module.exports = router;
