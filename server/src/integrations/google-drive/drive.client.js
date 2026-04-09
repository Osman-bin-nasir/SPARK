const { Readable } = require('stream');
const { google } = require('googleapis');
const { assertGoogleDriveEnv, env } = require('../../config/env');
const { HttpError } = require('../../utils/http-error');

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function escapeDriveQueryValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function createOAuthClient() {
  assertGoogleDriveEnv();

  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri
  );
}

function createDriveClient(refreshToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    oauth2Client,
    drive: google.drive({
      version: 'v3',
      auth: oauth2Client
    })
  };
}

function buildAuthUrl(state) {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GOOGLE_DRIVE_SCOPE],
    state
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  return {
    oauth2Client,
    tokens
  };
}

async function findFolderByName(drive, parentFolderId, name) {
  const query = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `'${escapeDriveQueryValue(parentFolderId)}' in parents`,
    `mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed = false'
  ].join(' and ');

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1
  });

  return response.data.files?.[0] || null;
}

async function createFolder(drive, parentFolderId, name) {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      parents: [parentFolderId]
    },
    fields: 'id, name'
  });

  return response.data;
}

async function ensureChildFolder(drive, parentFolderId, name) {
  const existingFolder = await findFolderByName(drive, parentFolderId, name);

  if (existingFolder) {
    return existingFolder;
  }

  return createFolder(drive, parentFolderId, name);
}

async function ensureSparkOrganizationRootFolder(drive, organizationId) {
  const sparkRoot = await ensureChildFolder(drive, 'root', 'SPARK');
  const orgRoot = await ensureChildFolder(drive, sparkRoot.id, organizationId);
  return orgRoot.id;
}

async function ensureFolderPath(drive, driveRootFolderId, segments) {
  let currentParentId = driveRootFolderId;

  for (const segment of segments) {
    const folder = await ensureChildFolder(drive, currentParentId, segment);
    currentParentId = folder.id;
  }

  return currentParentId;
}

async function uploadFile({
  drive,
  parentFolderId,
  fileName,
  mimeType,
  buffer
}) {
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId]
    },
    media: {
      mimeType,
      body: Readable.from(buffer)
    },
    fields: 'id, parents'
  });

  return {
    id: response.data.id,
    parents: response.data.parents || [parentFolderId]
  };
}

async function deleteFile(drive, fileId) {
  await drive.files.delete({ fileId });
}

async function downloadFile(drive, fileId) {
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data);
}

async function resolveGoogleEmail({ oauth2Client, drive, tokens }) {
  if (tokens?.id_token) {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.googleClientId
    });
    const payload = ticket.getPayload();

    if (payload?.email) {
      return payload.email;
    }
  }

  const response = await drive.about.get({
    fields: 'user(emailAddress)'
  });

  const googleEmail = response.data.user?.emailAddress;

  if (!googleEmail) {
    throw new HttpError(502, 'Unable to resolve Google account email address');
  }

  return googleEmail;
}

module.exports = {
  buildAuthUrl,
  createDriveClient,
  createOAuthClient,
  downloadFile,
  deleteFile,
  ensureFolderPath,
  ensureSparkOrganizationRootFolder,
  exchangeCodeForTokens,
  resolveGoogleEmail,
  uploadFile
};
