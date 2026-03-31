const googleDriveService = require('../services/google-drive.service');
const { env } = require('../config/env');

async function connect(req, res, next) {
  try {
    let url;

    if (req.auth?.userId) {
      const organizationId = req.get('x-organization-id');

      if (!organizationId) {
        res.status(400).json({ error: 'X-Organization-Id header is required' });
        return;
      }

      url = await googleDriveService.createConnectUrl({
        userId: req.auth.userId,
        organizationId
      });
    } else {
      url = await googleDriveService.createDevelopmentConnectUrl({
        organizationId: req.query.organization_id
      });
    }

    res.redirect(url);
  } catch (error) {
    next(error);
  }
}

async function connectUrl(req, res, next) {
  try {
    const organizationId = req.get('x-organization-id');

    if (!organizationId) {
      res.status(400).json({ error: 'X-Organization-Id header is required' });
      return;
    }

    const url = await googleDriveService.createConnectUrl({
      userId: req.auth.userId,
      organizationId
    });

    res.status(200).json({ url });
  } catch (error) {
    next(error);
  }
}

async function callback(req, res) {
  try {
    const result = await googleDriveService.handleOauthCallback({
      code: req.query.code,
      state: req.query.state
    });

    res.redirect(result.redirectUrl);
  } catch (error) {
    const redirectUrl = new URL(env.googleDrivePostConnectUrl || env.appBaseUrl);
    redirectUrl.searchParams.set('drive', 'error');
    redirectUrl.searchParams.set('message', error.message || 'Failed to connect Google Drive');
    res.redirect(redirectUrl.toString());
  }
}

async function status(req, res, next) {
  try {
    const result = await googleDriveService.getDriveStatus(req.organization.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  callback,
  connect,
  connectUrl,
  status
};
