const express = require('express');
const ragController = require('../controllers/rag.controller');
const nlpController = require('../controllers/nlp.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

// Backward-compatible alias for AI summaries via deterministic RAG answer.
router.post('/answer', ragController.answer);
router.post('/query', nlpController.query);

module.exports = router;
