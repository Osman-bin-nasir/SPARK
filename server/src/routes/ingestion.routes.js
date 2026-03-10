const express = require('express');
const ingestionController = require('../controllers/ingestion.controller');
const { verifySignedWebhook } = require('../middleware/webhook.middleware');

const router = express.Router();

router.post('/document', verifySignedWebhook, ingestionController.ingestDocument);

module.exports = router;
