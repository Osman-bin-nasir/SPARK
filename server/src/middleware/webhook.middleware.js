const crypto = require('crypto');
const { assertWebhookEnv, env } = require('../config/env');
const { HttpError } = require('../utils/http-error');
const { parseMultipartRequest } = require('../utils/multipart');

function verifySparkSignature(signature, payload) {
  const expected = crypto
    .createHmac('sha256', env.webhookSecret)
    .update(payload)
    .digest('hex');

  const normalized = String(signature || '').trim();

  if (!normalized.startsWith('sha256=')) {
    throw new HttpError(401, 'Invalid webhook signature');
  }

  const received = normalized.slice('sha256='.length);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    throw new HttpError(401, 'Invalid webhook signature');
  }

  if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new HttpError(401, 'Invalid webhook signature');
  }
}

async function verifySignedWebhook(req, _res, next) {
  try {
    assertWebhookEnv();

    const signature = req.get('x-spark-signature');

    if (!signature) {
      throw new HttpError(401, 'X-Spark-Signature header is required');
    }

    if (!req.is('multipart/form-data')) {
      throw new HttpError(415, 'Content-Type must be multipart/form-data');
    }

    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > env.ingestionMaxBodyBytes) {
        req.destroy(new HttpError(413, 'Request body is too large'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        req.rawBody = Buffer.concat(chunks);
        parseMultipartRequest({
          headers: req.headers,
          bodyBuffer: req.rawBody
        })
          .then((multipart) => {
            const payload = multipart.fields?.payload;

            if (typeof payload !== 'string' || !payload) {
              throw new HttpError(400, 'payload is required');
            }

            verifySparkSignature(signature, payload);
            req.multipart = multipart;
            next();
          })
          .catch(next);
      } catch (error) {
        next(error);
      }
    });

    req.on('error', (error) => {
      next(error);
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifySignedWebhook
};
