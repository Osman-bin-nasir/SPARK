const express = require('express');
const ingestionController = require('../controllers/ingestion.controller');
const { verifySignedJsonWebhook, verifySignedWebhook } = require('../middleware/webhook.middleware');

const router = express.Router();

router.post('/document', verifySignedWebhook, ingestionController.ingestDocument);
router.post('/text', verifySignedJsonWebhook, ingestionController.ingestText);

module.exports = router;
