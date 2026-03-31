import { API_BASE_URL } from './endpoints';
import { endpoints } from './endpoints';

function getStoredAccessToken() {
  return localStorage.getItem('token') || '';
}

function getStoredRefreshToken() {
  return localStorage.getItem('refresh_token') || '';
}

function persistAuth(result) {
  const accessToken = result.access_token || result.token || '';
  const refreshToken = result.refresh_token || '';

  if (accessToken) {
    localStorage.setItem('token', accessToken);
  }

  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }

  if (result.user) {
    localStorage.setItem('user', JSON.stringify(result.user));
  }

  window.dispatchEvent(new CustomEvent('spark-auth-updated', {
    detail: {
      token: accessToken,
      refreshToken,
      user: result.user || null
    }
  }));
}

function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('spark-auth-expired'));
}

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

async function tryRefreshAccessToken() {
  const refreshToken = getStoredRefreshToken();

  if (!refreshToken) {
    clearStoredAuth();
    throw new Error('Session expired');
  }

  const response = await fetch(`${API_BASE_URL}${endpoints.refresh}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      refresh_token: refreshToken
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    clearStoredAuth();
    throw new Error(data.error || 'Session expired');
  }

  persistAuth(data);
  return getStoredAccessToken();
}

async function request(path, options = {}, retryState = { attemptedRefresh: false }) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const resolvedToken = options.token === undefined ? getStoredAccessToken() : (getStoredAccessToken() || options.token);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: buildHeaders({
      ...options,
      token: resolvedToken || undefined
    }),
    body: options.body
  });

  const data = await response.json().catch(() => ({}));

  const shouldTryRefresh = response.status === 401
    && !retryState.attemptedRefresh
    && path !== endpoints.refresh
    && Boolean(resolvedToken)
    && typeof data.error === 'string'
    && ['Token expired', 'Invalid token', 'invalid refresh token'].includes(data.error);

  if (shouldTryRefresh) {
    await tryRefreshAccessToken();
    return request(path, options, { attemptedRefresh: true });
  }

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
