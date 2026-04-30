import { API_BASE_URL } from './endpoints';
import { endpoints } from './endpoints';

let refreshPromise = null;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30_000;

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

function parseJwtPayload(token) {
  if (!token) {
    return null;
  }

  try {
    const [, payloadSegment] = String(token).split('.');

    if (!payloadSegment) {
      return null;
    }

    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function shouldRefreshAccessToken(token) {
  const payload = parseJwtPayload(token);
  const expiresAtSeconds = Number(payload?.exp);

  if (!expiresAtSeconds) {
    return false;
  }

  return (expiresAtSeconds * 1000) - Date.now() <= ACCESS_TOKEN_REFRESH_BUFFER_MS;
}

function shouldAttemptRefresh({ errorMessage, path, responseStatus, token }) {
  if (responseStatus !== 401 || path === endpoints.refresh) {
    return false;
  }

  if (!token || !getStoredRefreshToken()) {
    return false;
  }

  if (!errorMessage) {
    return true;
  }

  return [
    'Authentication required',
    'Invalid token',
    'Token expired',
    'invalid refresh token'
  ].includes(errorMessage);
}

async function tryRefreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshAccessToken();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refreshAccessToken() {
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

async function resolveRequestToken(path, explicitToken) {
  const token = explicitToken || getStoredAccessToken();

  if (!token || path === endpoints.refresh || !getStoredRefreshToken()) {
    return token;
  }

  if (!shouldRefreshAccessToken(token)) {
    return token;
  }

  return tryRefreshAccessToken();
}

async function request(path, options = {}, retryState = { attemptedRefresh: false }) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const explicitToken = typeof options.token === 'string' ? options.token.trim() : '';
  const resolvedToken = await resolveRequestToken(path, explicitToken);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: buildHeaders({
      ...options,
      token: resolvedToken || undefined
    }),
    body: options.body
  });

  const data = await response.json().catch(() => ({}));

  const shouldTryRefresh = !retryState.attemptedRefresh && shouldAttemptRefresh({
    errorMessage: typeof data.error === 'string' ? data.error : '',
    path,
    responseStatus: response.status,
    token: resolvedToken
  });

  if (shouldTryRefresh) {
    await tryRefreshAccessToken();
    return request(path, options, { attemptedRefresh: true });
  }

  if (!response.ok) {
    if (response.status === 401 && path !== endpoints.refresh) {
      clearStoredAuth();
    }

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

export async function put(path, body, options = {}) {
  return request(path, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function patch(path, body, options = {}) {
  return request(path, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export async function del(path, options = {}) {
  return request(path, {
    ...options,
    method: 'DELETE',
    contentType: false
  });
}
