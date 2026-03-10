const crypto = require('crypto');
const { env } = require('../../config/env');

function normalizeEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== 384) {
    throw new Error('Embedding provider must return an array of 384 numbers');
  }

  return embedding.map((value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error('Embedding provider returned a non-numeric value');
    }

    return Number(number.toFixed(6));
  });
}

function buildDeterministicEmbedding(input) {
  const values = [];
  let seed = String(input || '');

  while (values.length < 384) {
    const hash = crypto.createHash('sha256').update(seed).digest();

    for (let index = 0; index < hash.length && values.length < 384; index += 4) {
      const chunk = hash.subarray(index, Math.min(index + 4, hash.length));
      const paddedChunk = chunk.length === 4 ? chunk : Buffer.concat([chunk, Buffer.alloc(4 - chunk.length)]);
      const integer = paddedChunk.readUInt32BE(0);
      const normalized = (integer / 0xffffffff) * 2 - 1;
      values.push(Number(normalized.toFixed(6)));
    }

    seed = `${seed}:${hash.toString('hex')}`;
  }

  return values;
}

async function generateEmbedding(input) {
  if (env.embeddingApiUrl) {
    const response = await fetch(env.embeddingApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.embeddingApiKey ? { Authorization: `Bearer ${env.embeddingApiKey}` } : {})
      },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      throw new Error(`Embedding provider request failed with status ${response.status}`);
    }

    const data = await response.json();
    return normalizeEmbedding(data.embedding);
  }

  if (env.nodeEnv === 'production' && env.embeddingProvider !== 'local') {
    throw new Error('Embedding provider is not configured');
  }

  return buildDeterministicEmbedding(input);
}

module.exports = {
  generateEmbedding
};
