const crypto = require('crypto');
const { env } = require('../config/env');
const { HttpError } = require('./http-error');

function getEncryptionKey() {
  const rawKey = env.googleTokenEncryptionKey;

  if (!rawKey) {
    throw new HttpError(500, 'Google token encryption key is not configured');
  }

  if (/^[A-Fa-f0-9]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  try {
    const base64Buffer = Buffer.from(rawKey, 'base64');

    if (base64Buffer.length === 32) {
      return base64Buffer;
    }
  } catch (_error) {
    // Fall back to utf8 handling below.
  }

  const utf8Buffer = Buffer.from(rawKey, 'utf8');

  if (utf8Buffer.length === 32) {
    return utf8Buffer;
  }

  throw new HttpError(500, 'GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte utf8, base64, or hex value');
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag
  };
}

function decryptText({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = {
  decryptText,
  encryptText
};
