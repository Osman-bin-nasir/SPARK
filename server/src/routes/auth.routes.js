const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/signup', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/create-telegram-login', authController.createTelegramLogin);
router.post('/link-telegram', requireAuth, authController.linkTelegram);

module.exports = router;
