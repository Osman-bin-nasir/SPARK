const authService = require('../services/auth.service');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function telegramLogin(req, res, next) {
  try {
    const result = await authService.loginWithTelegram(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function whatsappLogin(req, res, next) {
  try {
    const result = await authService.loginWithWhatsapp(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refreshAccessToken(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function createTelegramLogin(req, res, next) {
  try {
    const result = await authService.createTelegramLogin(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function createWhatsappLogin(req, res, next) {
  try {
    const result = await authService.createWhatsappLogin(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function linkTelegram(req, res, next) {
  try {
    const result = await authService.linkTelegramAccount({
      userId: req.auth.userId,
      token: req.body.token
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function linkWhatsapp(req, res, next) {
  try {
    const result = await authService.linkWhatsappAccount({
      userId: req.auth.userId,
      token: req.body.token
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTelegramLogin,
  createWhatsappLogin,
  linkTelegram,
  linkWhatsapp,
  login,
  refresh,
  register,
  telegramLogin,
  whatsappLogin
};
