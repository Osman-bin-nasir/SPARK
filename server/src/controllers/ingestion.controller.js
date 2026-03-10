const ingestionService = require('../services/ingestion.service');
const { HttpError } = require('../utils/http-error');
const { parseMultipartRequest } = require('../utils/multipart');

async function ingestDocument(req, res, next) {
  try {
    if (!req.rawBody) {
      throw new HttpError(400, 'Signed webhook body is missing');
    }

    const { fields, files } = await parseMultipartRequest({
      headers: req.headers,
      bodyBuffer: req.rawBody
    });

    let payload = {};

    if (fields.payload) {
      try {
        payload = JSON.parse(fields.payload);
      } catch (_error) {
        throw new HttpError(400, 'payload must be valid JSON');
      }
    }

    const file = files[0];
    const result = await ingestionService.ingestDocument({
      organizationId: req.get('x-organization-id'),
      payload,
      file
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ingestDocument
};
