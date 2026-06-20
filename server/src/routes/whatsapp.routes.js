const express = require('express');
const whatsappController = require('../controllers/whatsapp.controller');
const { verifySignedJsonWebhookWithoutOrganization } = require('../middleware/webhook.middleware');

const router = express.Router();

router.post('/join-by-code', verifySignedJsonWebhookWithoutOrganization, whatsappController.joinByCode);
router.post('/memberships', verifySignedJsonWebhookWithoutOrganization, whatsappController.memberships);

module.exports = router;
