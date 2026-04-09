const googleIntegrationsRepository = require('../db/google-integrations.repository');
const organizationsRepository = require('../db/organizations.repository');
const { env } = require('../config/env');
const {
  buildAuthUrl,
  createDriveClient,
  downloadFile,
  ensureSparkOrganizationRootFolder,
  exchangeCodeForTokens,
  resolveGoogleEmail
} = require('../integrations/google-drive/drive.client');
const { HttpError } = require('../utils/http-error');
const { verifyGoogleOauthState, signGoogleOauthState } = require('../utils/jwt');
const { decryptText, encryptText } = require('../utils/encryption');

function buildCallbackRedirectUrl(params) {
  const url = new URL(env.googleDrivePostConnectUrl || env.appBaseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function assertOrganizationAdmin(userId, organizationId) {
  const membership = await organizationsRepository.findMembership({ userId, organizationId });

  if (!membership) {
    throw new HttpError(403, 'You do not have access to this organization');
  }

  if (!['founder', 'admin'].includes(membership.role)) {
    throw new HttpError(403, 'Only founders and admins can manage Google Drive');
  }

  return membership;
}

async function createConnectUrl({ userId, organizationId }) {
  await assertOrganizationAdmin(userId, organizationId);

  const state = signGoogleOauthState({ userId, organizationId });
  return buildAuthUrl(state);
}

async function createDevelopmentConnectUrl({ organizationId }) {
  if (env.nodeEnv !== 'development') {
    throw new HttpError(404, 'Route not found');
  }

  if (!organizationId) {
    throw new HttpError(400, 'organization_id is required');
  }

  const organization = await organizationsRepository.findOrganizationById(organizationId);

  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  const driveOwner = await organizationsRepository.findOrganizationDriveOwner(organizationId);

  if (!driveOwner) {
    throw new HttpError(409, 'Organization does not have a founder or admin to own the Google Drive integration');
  }

  const state = signGoogleOauthState({
    userId: driveOwner.user_id,
    organizationId
  });

  return buildAuthUrl(state);
}

async function handleOauthCallback({ code, state }) {
  if (!code) {
    throw new HttpError(400, 'Missing Google OAuth code');
  }

  if (!state) {
    throw new HttpError(400, 'Missing Google OAuth state');
  }

  const statePayload = verifyGoogleOauthState(state);
  const organizationId = statePayload.organization_id;
  const userId = statePayload.sub;

  await assertOrganizationAdmin(userId, organizationId);

  const existingIntegration = await googleIntegrationsRepository.findByOrganizationId(organizationId);
  const { tokens } = await exchangeCodeForTokens(code);

  let refreshToken = tokens.refresh_token;

  if (!refreshToken && existingIntegration) {
    refreshToken = decryptText({
      ciphertext: existingIntegration.refresh_token_ciphertext,
      iv: existingIntegration.refresh_token_iv,
      tag: existingIntegration.refresh_token_tag
    });
  }

  if (!refreshToken) {
    throw new HttpError(400, 'Google did not return a refresh token. Please reconnect and grant offline access.');
  }

  const { drive, oauth2Client } = createDriveClient(refreshToken);
  const googleEmail = await resolveGoogleEmail({ oauth2Client, drive, tokens });
  const driveRootFolderId = await ensureSparkOrganizationRootFolder(drive, organizationId);
  const encryptedRefreshToken = encryptText(refreshToken);

  const integration = await googleIntegrationsRepository.upsertIntegration({
    organizationId,
    ownerUserId: userId,
    googleEmail,
    refreshTokenCiphertext: encryptedRefreshToken.ciphertext,
    refreshTokenIv: encryptedRefreshToken.iv,
    refreshTokenTag: encryptedRefreshToken.tag,
    driveRootFolderId
  });

  return {
    integration,
    redirectUrl: buildCallbackRedirectUrl({
      drive: 'connected'
    })
  };
}

async function getDriveStatus(organizationId) {
  const integration = await googleIntegrationsRepository.findByOrganizationId(organizationId);

  if (!integration) {
    return {
      connected: false
    };
  }

  return {
    connected: true,
    google_email: integration.google_email,
    drive_root_folder_id: integration.drive_root_folder_id,
    connected_at: integration.created_at
  };
}

async function getOrganizationDriveClient(organizationId) {
  const integration = await googleIntegrationsRepository.findByOrganizationId(organizationId);

  if (!integration) {
    throw new HttpError(409, 'Google Drive is not connected for this organization');
  }

  const refreshToken = decryptText({
    ciphertext: integration.refresh_token_ciphertext,
    iv: integration.refresh_token_iv,
    tag: integration.refresh_token_tag
  });

  const { drive, oauth2Client } = createDriveClient(refreshToken);

  return {
    drive,
    oauth2Client,
    integration
  };
}

async function getOrganizationDocumentFile({ organizationId, driveFileId }) {
  if (!driveFileId) {
    throw new HttpError(404, 'Document file not found');
  }

  const { drive } = await getOrganizationDriveClient(organizationId);
  const buffer = await downloadFile(drive, driveFileId);

  return { buffer };
}

module.exports = {
  createConnectUrl,
  createDevelopmentConnectUrl,
  getDriveStatus,
  getOrganizationDocumentFile,
  getOrganizationDriveClient,
  handleOauthCallback
};
