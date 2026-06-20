const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/signup', authController.register);
router.post('/login', authController.login);
router.post('/telegram', authController.telegramLogin);
router.post('/whatsapp', authController.whatsappLogin);
router.post('/refresh', authController.refresh);
router.post('/create-telegram-login', authController.createTelegramLogin);
router.post('/create-whatsapp-login', authController.createWhatsappLogin);
router.post('/link-telegram', requireAuth, authController.linkTelegram);
router.post('/link-whatsapp', requireAuth, authController.linkWhatsapp);

module.exports = router;
