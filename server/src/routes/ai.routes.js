const express = require('express');
const ragController = require('../controllers/rag.controller');
const nlpController = require('../controllers/nlp.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');
const { createSearchMetricsMiddleware } = require('../middleware/search-metrics.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

// Backward-compatible alias for AI summaries via deterministic RAG answer.
router.post('/answer', createSearchMetricsMiddleware('/api/ai/answer'), ragController.answer);
router.post('/query', createSearchMetricsMiddleware('/api/ai/query'), nlpController.query);

module.exports = router;
