const express = require('express');
const ragController = require('../controllers/rag.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);
router.post('/answer', ragController.answer);

module.exports = router;
