const express = require('express');
const transactionController = require('../controllers/transaction.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  requireOrganizationMembership,
  requireOrganizationRole
} = require('../middleware/organization.middleware');
const { createSearchMetricsMiddleware } = require('../middleware/search-metrics.middleware');

const router = express.Router();

router.use(requireAuth, requireOrganizationMembership);

router.get('/', transactionController.listTransactions);
router.get('/google-sheets', transactionController.getTransactionsGoogleSheet);
router.post('/search', createSearchMetricsMiddleware('/api/transactions/search'), transactionController.searchTransactions);
router.post('/', requireOrganizationRole(['founder', 'co-founder', 'admin']), transactionController.createTransaction);
router.get('/:id/document', transactionController.getTransactionDocument);
router.get('/:id', transactionController.getTransaction);
router.patch('/:id', requireOrganizationRole(['founder', 'co-founder', 'admin']), transactionController.updateTransaction);
router.delete('/:id', requireOrganizationRole(['founder', 'co-founder', 'admin']), transactionController.deleteTransaction);

module.exports = router;
