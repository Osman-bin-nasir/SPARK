import { pageCache } from './page-cache.js';

const SESSION_KEY = 'spark.session-id';
let controller = new AbortController();
let knownIdentity;
let accessToken='';
export const getAccessToken=()=>accessToken;

export function getStoredUser() {
  try {
    const value = JSON.parse(localStorage.getItem('user') || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) && typeof value.id === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function getSessionIdentity() {
  return `${localStorage.getItem(SESSION_KEY) || 'legacy'}:${getStoredUser()?.id || ''}`;
}

function invalidateRequests() {
  controller.abort();
  controller = new AbortController();
  pageCache.clear();
  knownIdentity = getSessionIdentity();
}

export function captureSession() {
  const identity = getSessionIdentity();
  if (knownIdentity !== undefined && knownIdentity !== identity) { accessToken=''; invalidateRequests(); }
  knownIdentity = identity;
  return { identity, signal: controller.signal };
}

export function assertCurrentSession(session) {
  if (session.signal.aborted || session.identity !== getSessionIdentity()) {
    throw new DOMException('This request belongs to a previous session.', 'AbortError');
  }
}

export function syncSessionFromStorage() {
  captureSession();
  return { token: getStoredUser() ? accessToken : '', user: getStoredUser() };
}

function writeAuth(result) {
  const token = result.access_token || result.token || '';
  accessToken=token;
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
  window.dispatchEvent(new CustomEvent('spark-auth-updated', { detail: { token, user: result.user || getStoredUser() } }));
}

export function startSession(result) {
  localStorage.removeItem('refresh_token');
  localStorage.setItem(SESSION_KEY, globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  invalidateRequests();
  writeAuth(result);
  knownIdentity = getSessionIdentity();
}

export function refreshSession(result, session) {
  assertCurrentSession(session);
  writeAuth(result);
}

export function clearSession() {
  accessToken='';
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.setItem(SESSION_KEY, globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  invalidateRequests();
  window.dispatchEvent(new Event('spark-auth-expired'));
}
