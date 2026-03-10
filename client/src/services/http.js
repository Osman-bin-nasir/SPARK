import { API_BASE_URL } from './endpoints';

function buildHeaders(options = {}) {
  const headers = {
    ...options.headers
  };

  if (options.contentType !== false) {
    headers['Content-Type'] = options.contentType || 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return headers;
}

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: buildHeaders(options),
    body: options.body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

export async function get(path, options = {}) {
  return request(path, {
    ...options,
    method: 'GET',
    contentType: false
  });
}

export async function post(path, body, options = {}) {
  return request(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body)
  });
}
