const express = require('express');
const monitoringController = require('../controllers/monitoring.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/search', monitoringController.getSearchMetrics);

module.exports = router;
