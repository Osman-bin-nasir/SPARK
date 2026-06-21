const express = require('express');
const transactionController = require('../controllers/transaction.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireOrganizationMembership } = require('../middleware/organization.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

router.get('/', transactionController.getExpenses);

module.exports = router;
