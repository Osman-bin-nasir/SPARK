import { API_BASE_URL, endpoints } from './endpoints.js';
import { assertCurrentSession, captureSession, clearSession, refreshSession, getAccessToken } from './session.js';

const PUBLIC_AUTH_PATHS = new Set([
  endpoints.login, endpoints.register, endpoints.signup, '/auth/telegram', '/auth/whatsapp',
  '/auth/create-telegram-login', '/auth/create-whatsapp-login', '/auth/invitations/preview', '/auth/refresh', '/auth/logout'
]);

function expiresSoon(token) {
  try {
    const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')));
    return Number.isFinite(payload.exp) && payload.exp * 1000 - Date.now() <= 30000;
  } catch { return false; }
}

function requestError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Tests use this factory with an isolated backend; production uses one client.
export function createHttpClient(baseUrl, { timeoutMs = 90000 } = {}) {
  let refreshPromise;

  async function transport(path, options, session, token, responseType = 'json') {
    assertCurrentSession(session);
    const controller = new AbortController();
    const signals = [session.signal, options.signal].filter(Boolean);
    const abort = () => controller.abort();
    let timedOut = false;
    for (const signal of signals) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const headers = { 'X-Spark-Browser-Session':'1', ...options.headers };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET', headers, body: options.body, signal: controller.signal, credentials:'include'
      });
      const data = response.ok && responseType === 'blob'
        ? await response.blob()
        : response.status === 204 ? null : await response.json().catch(() => null);
      assertCurrentSession(session);
      if (response.ok && data === null && response.status !== 204) {
        throw requestError('The server returned an unexpected response. Please try again.', response.status);
      }
      return { response, data };
    } catch (error) {
      assertCurrentSession(session);
      if (timedOut) throw requestError('The server is taking too long to respond. Please try again.', 408);
      throw error;
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', abort);
    }
  }

  async function refresh(session) {
    if (refreshPromise?.identity === session.identity) return refreshPromise.promise;
    const operation = { identity: session.identity };
    const perform = async () => {
      const { response, data } = await transport(endpoints.refresh, {
        method: 'POST', body: '{}'
      }, session);
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) clearSession();
        throw requestError(data?.error || 'Unable to refresh your session. Please try again.', response.status);
      }
      if (!data?.access_token && !data?.token) throw requestError('Invalid session response. Please try again.', 502);
      refreshSession(data, session);
      return data.access_token || data.token;
    };
    operation.promise = (globalThis.navigator?.locks
      ? navigator.locks.request('spark-refresh',perform) : perform())
      .finally(() => { if (refreshPromise === operation) refreshPromise = null; });
    refreshPromise = operation;
    return operation.promise;
  }

  async function request(path, options = {}, responseType = 'json') {
    if (!baseUrl) throw new Error('VITE_API_BASE_URL is not configured');
    const session = captureSession();
    const publicRequest = PUBLIC_AUTH_PATHS.has(path.split('?')[0]);
    let token = publicRequest ? '' : options.token || getAccessToken() || '';
    let refreshed = false;
    if (token && expiresSoon(token)) {
      token = await refresh(session);
      refreshed = true;
    }
    let result = await transport(path, options, session, token, responseType);
    if (!publicRequest && result.response.status === 401 && token && !refreshed) {
      token = await refresh(session);
      result = await transport(path, options, session, token, responseType);
    }
    if (!result.response.ok) {
      if (!publicRequest && result.response.status === 401) clearSession();
      throw requestError(typeof result.data?.error === 'string' ? result.data.error : 'Request failed. Please try again.', result.response.status);
    }
    return result.data;
  }

  return {
    restoreSession: () => refresh(captureSession()),
    get: (path, options) => request(path, options),
    getBlob: (path, options) => request(path, options, 'blob'),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
    del: (path, options) => request(path, { ...options, method: 'DELETE' })
  };
}

export const { get, getBlob, post, put, patch, del, restoreSession } = createHttpClient(API_BASE_URL);
