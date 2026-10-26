class ProviderError extends Error {
  constructor(provider, status, retryAfter = 0) {
    super(`${provider} request failed${status ? ` (${status})` : ''}`);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.permanent = status >= 400 && status < 500 && ![408, 409, 429].includes(status);
  }
}

async function request(url, options = {}, provider = 'Provider') {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(90000) });
  } catch (_) {
    throw new ProviderError(provider);
  }
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    await response.body?.cancel();
    throw new ProviderError(provider, response.status, retryAfter);
  }
  return response;
}

async function readBytes(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw Object.assign(new Error('File is too large'), { permanent: true });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('File is too large'), { permanent: true });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { request, readBytes, ProviderError };
