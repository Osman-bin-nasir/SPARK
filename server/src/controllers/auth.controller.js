const authService = require('../services/auth.service');
const sessions=require('../services/session.service');
const users=require('../db/users.repository');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    await sessions.respond(req,res,result,201);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    await sessions.respond(req,res,result);
  } catch (error) {
    next(error);
  }
}

async function telegramLogin(req, res, next) {
  try {
    const result = await authService.loginWithTelegram(req.body);
    await sessions.respond(req,res,await authService.buildAuthResponse(result.user));
  } catch (error) {
    next(error);
  }
}

async function whatsappLogin(req, res, next) {
  try {
    const result = await authService.loginWithWhatsapp(req.body);
    await sessions.respond(req,res,await authService.buildAuthResponse(result.user));
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    sessions.requireCookieIntent(req);
    const session=await sessions.rotate(sessions.cookieToken(req)||req.body?.refresh_token);
    const user=await users.findUserById(session.userId);
    if(!user)throw Object.assign(new Error('Session expired'),{statusCode:401});
    await sessions.respond(req,res,await authService.buildAuthResponse(users.mapUser(user)),200,session);
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

async function unlinkTelegram(req, res, next) {
  try {
    const result = await authService.unlinkTelegramAccount({
      userId: req.auth.userId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function unlinkWhatsapp(req, res, next) {
  try {
    const result = await authService.unlinkWhatsappAccount({
      userId: req.auth.userId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  logout: async(req,res,next)=>{try{sessions.requireCookieIntent(req);await sessions.revoke(sessions.cookieToken(req)||req.body?.refresh_token);sessions.setCookie(res,'');res.sendStatus(204);}catch(error){next(error);}},
  createTelegramLogin,
  createWhatsappLogin,
  linkTelegram,
  linkWhatsapp,
  unlinkTelegram,
  unlinkWhatsapp,
  login,
  refresh,
  register,
  telegramLogin,
  whatsappLogin
};
