const express = require('express');
const bedrockController = require('../controllers/bedrock.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { env } = require('../config/env');
const { HttpError } = require('../utils/http-error');

const router = express.Router();

function requireApiKeyOrAuth(req, res, next) {
  // If the server administrator configured a BEDROCK_API_KEY, use it to allow simple access for n8n.
  if (env.bedrockApiKey) {
    const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '').trim();
    if (apiKey === env.bedrockApiKey) {
      return next();
    }
    // If a key was provided but it's wrong, we can reject immediately or fall back to JWT.
    // Let's reject immediately if they attempted to use X-API-Key to avoid confusion.
    if (req.get('X-API-Key')) {
      return next(new HttpError(401, 'Invalid API Key'));
    }
  }

  // Fallback to standard JWT auth
  return requireAuth(req, res, next);
}

router.post('/chat', requireApiKeyOrAuth, bedrockController.chat);

module.exports = router;
