import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../src/services/http.js';
import { captureSession, clearSession, getStoredUser, getAccessToken, startSession, syncSessionFromStorage } from '../src/services/session.js';
import { pageCache } from '../src/services/page-cache.js';

const originalFetch = globalThis.fetch;
const api = () => createHttpClient('https://api.example.test');
const user = { id: 'user-a', organizations: [{ id: 'org-a' }] };
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function expired() { return `header.${btoa(JSON.stringify({ exp: 1 }))}.signature`; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }

test.beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
  globalThis.window = new EventTarget();
  startSession({ access_token: 'access-a', refresh_token: 'refresh-a', user });
});
test.afterEach(() => { globalThis.fetch = originalFetch; clearSession(); });

test('public login neither refreshes an expired old session nor sends its credentials', async () => {
  startSession({access_token:expired(),user});
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.example.test/auth/login');
    assert.equal(options.headers.Authorization, undefined);
    return json({ error: 'Invalid credentials' }, 401);
  };
  await assert.rejects(api().post('/auth/login', { email: 'new@example.test', password: 'incorrect' }), /Invalid credentials/);
  assert.equal(requests, 1);
  assert.equal(getStoredUser().id, 'user-a');
});

test('invitation preview works independently of an expired or different signed-in account', async () => {
  startSession({access_token:expired(),user});
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.example.test/auth/invitations/preview');
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { token: 'preview-token' });
    return json({ email: 'invited@example.test', organization_name: 'Inviting team' });
  };
  const invitation = await api().post('/auth/invitations/preview', { token: 'preview-token' });
  assert.equal(invitation.email, 'invited@example.test');
  assert.equal(requests, 1);
  assert.equal(getStoredUser().id, 'user-a');
});

test('401 retries use the refreshed token even when the component supplied an old token', async () => {
  const seen = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) return json({ access_token: 'access-new', refresh_token: 'refresh-new', user });
    seen.push(options.headers.Authorization);
    return options.headers.Authorization === 'Bearer access-new' ? json({ items: [42] }) : json({ error: 'Invalid token' }, 401);
  };
  assert.deepEqual(await api().get('/transactions', { token: 'access-a' }), { items: [42] });
  assert.deepEqual(seen, ['Bearer access-a', 'Bearer access-new']);
});

test('parallel protected requests share one refresh operation', async () => {
  startSession({access_token:expired(),user});
  const ready = deferred();
  let refreshes = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; await ready.promise; return json({ access_token: 'fresh', user }); }
    return json({ ok: true });
  };
  const client = api();
  const requests = [client.get('/one'), client.get('/two'), client.get('/three')];
  ready.resolve();
  await Promise.all(requests);
  assert.equal(refreshes, 1);
});

for (const replacement of ['logout', 'another account']) {
  test(`an old refresh cannot restore credentials after ${replacement}`, async () => {
    startSession({access_token:expired(),user});
    const ready = deferred();
    globalThis.fetch = async () => { await ready.promise; return json({ access_token: 'old-restored', user }); };
    const result = assert.rejects(api().get('/transactions'), error => error.name === 'AbortError');
    if (replacement === 'logout') clearSession();
    else startSession({ access_token: 'access-b', refresh_token: 'refresh-b', user: { id: 'user-b' } });
    ready.resolve();
    await result;
    assert.equal(getAccessToken(), replacement === 'logout' ? '' : 'access-b');
  });
}

test('an old failed request cannot sign out a newly logged-in account', async () => {
  const ready = deferred();
  globalThis.fetch = async () => { await ready.promise; return json({ error: 'Invalid token' }, 401); };
  const result = assert.rejects(api().get('/transactions'), error => error.name === 'AbortError');
  startSession({ access_token: 'access-b', user: { id: 'user-b' } });
  ready.resolve();
  await result;
  assert.equal(getAccessToken(), 'access-b');
});

test('transient refresh failures preserve the session for a later retry', async () => {
  startSession({access_token:expired(),user});
  globalThis.fetch = async () => json({ error: 'Temporarily unavailable' }, 503);
  await assert.rejects(api().get('/transactions'), error => error.statusCode === 503);
  assert.equal(localStorage.getItem('refresh_token'), null);
  assert.equal(getStoredUser().id, 'user-a');
});

test('document downloads use the same authenticated refresh path', async () => {
  startSession({access_token:expired(),user});
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) return json({ access_token: 'fresh', user });
    assert.equal(options.headers.Authorization, 'Bearer fresh');
    assert.equal(options.headers['X-Organization-Id'], 'org-a');
    return new Response('receipt', { headers: { 'content-type': 'application/pdf' } });
  };
  const blob = await api().getBlob('/transactions/1/document', { headers: { 'X-Organization-Id': 'org-a' } });
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), 'receipt');
});

test('request timeouts and unexpected HTML produce useful errors without signing out', async () => {
  globalThis.fetch = async () => new Response('<html>cold start</html>');
  await assert.rejects(api().get('/transactions'), /unexpected response/);
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(createHttpClient('https://api.example.test', { timeoutMs: 5 }).get('/transactions'), /taking too long/);
  assert.equal(getAccessToken(), 'access-a');
});

test('malformed stored users fail closed; switching accounts clears all financial caches', () => {
  pageCache.set('dashboard', 'org-a', { amount: 42 });
  pageCache.set('analytics', 'org-a', { total: 42 });
  startSession({ access_token: 'access-b', user: { id: 'user-b' } });
  assert.equal(pageCache.get('dashboard', 'org-a'), null);
  assert.equal(pageCache.get('analytics', 'org-a'), null);
  localStorage.setItem('user', '{broken');
  assert.equal(getStoredUser(), null);
  assert.equal(syncSessionFromStorage().token, '');
});

test('cross-tab session changes abort old work and clear cached financial data', () => {
  const old = captureSession();
  pageCache.set('team', 'org-a', { members: ['old'] });
  localStorage.setItem('spark.session-id', 'another-tab-session');
  localStorage.setItem('user', JSON.stringify({ id: 'user-b' }));
  syncSessionFromStorage();
  assert.equal(old.signal.aborted, true);
  assert.equal(pageCache.get('team', 'org-a'), null);
});
test('access credentials stay in memory and cookie refresh uses credentials plus CSRF intent without a token body',async()=>{
  assert.equal(localStorage.getItem('token'),null);assert.equal(localStorage.getItem('refresh_token'),null);
  startSession({access_token:expired(),refresh_token:'must-not-persist',user});
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.credentials,'include');assert.equal(options.headers['X-Spark-Browser-Session'],'1');
    if(url.endsWith('/auth/refresh')){assert.deepEqual(JSON.parse(options.body),{});return json({access_token:'rotated-access',user});}
    assert.equal(options.headers.Authorization,'Bearer rotated-access');return json({ok:true});
  };
  await api().get('/transactions');
  assert.equal(getAccessToken(),'rotated-access');assert.equal(localStorage.getItem('token'),null);assert.equal(localStorage.getItem('refresh_token'),null);
});
