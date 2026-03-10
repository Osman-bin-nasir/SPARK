const Busboy = require('busboy');
const { HttpError } = require('./http-error');

async function parseMultipartRequest({ headers, bodyBuffer }) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    const busboy = Busboy({
      headers,
      limits: {
        files: 1
      }
    });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldName, stream, info) => {
      const chunks = [];

      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('limit', () => {
        reject(new HttpError(413, 'Uploaded file is too large'));
      });

      stream.on('end', () => {
        files.push({
          fieldName,
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: info.mimeType
        });
      });
    });

    busboy.on('error', reject);

    busboy.on('close', () => {
      resolve({ fields, files });
    });

    busboy.end(bodyBuffer);
  });
}

module.exports = {
  parseMultipartRequest
};
