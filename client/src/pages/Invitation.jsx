import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../services/http';
import { endpoints } from '../services/endpoints';
import AuthLayout from '../features/auth/auth-layout';
import LoginPage from '../features/login/login.page';
import SignupPage from '../features/signup/signup.page';

const INVITE_KEY = 'spark.workspace-invite-token';

function readInvitationToken() {
  const queryToken = new URLSearchParams(window.location.search).get('token');
  try { return queryToken || sessionStorage.getItem(INVITE_KEY) || ''; }
  catch { return queryToken || ''; }
}

export default function InvitationPage({ token: accessToken, user, onSuccess, onSignOut }) {
  const navigate = useNavigate();
  const [inviteToken] = useState(readInvitationToken);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('signup');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    try { sessionStorage.setItem(INVITE_KEY, inviteToken); } catch { /* Keep the token in component state. */ }
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const controller = new AbortController();
    post(endpoints.invitationPreview, { token: inviteToken }, { signal: controller.signal })
      .then(setInvitation)
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [inviteToken]);

  function finish(result) {
    try { sessionStorage.removeItem(INVITE_KEY); } catch { /* Optional browser storage. */ }
    onSuccess(result);
  }

  async function acceptWithLogin(result) {
    const joined = await post(endpoints.invitationAccept, { token: inviteToken }, { token: result.access_token || result.token });
    finish(joined);
  }

  async function accept() {
    if (busy) return;
    setBusy(true); setError('');
    try { finish(await post(endpoints.invitationAccept, { token: inviteToken }, { token: accessToken })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  if (!invitation) {
    return <AuthLayout signup onSwitch={() => navigate('/login')}>
      <p className="auth-form-eyebrow">SPARK</p><h1 className="auth-title">Workspace invitation</h1>
      <p className="auth-subtitle" role="status">{error || (!inviteToken ? 'Open the invitation link shared by your team.' : 'Checking your invitation…')}</p>
      <p className="auth-footer-note"><Link className="auth-link" to="/login">Back to sign in</Link></p>
    </AuthLayout>;
  }

  if (accessToken && user) {
    const wrongAccount = user.email?.toLowerCase() !== invitation.email;
    return <AuthLayout signup onSwitch={onSignOut}>
      <p className="auth-form-eyebrow">SPARK</p><h1 className="auth-title">Join {invitation.organization_name}</h1>
      <p className="auth-subtitle">Invitation for {invitation.email} · {invitation.role}</p>
      {wrongAccount ? <>
        <p className="auth-message is-notice">You are signed in as {user.email}. Use the invited account to continue.</p>
        <button className="auth-submit" type="button" onClick={onSignOut}>Use another account</button>
      </> : <>
        {error && <p className="auth-message is-error" role="alert">{error}</p>}
        <button className="auth-submit" type="button" disabled={busy} onClick={accept}>{busy ? 'Joining…' : 'Accept invitation'}</button>
      </>}
    </AuthLayout>;
  }

  return mode === 'signup'
    ? <SignupPage key={`signup:${inviteToken}`} invitation={invitation} invitationToken={inviteToken} onSuccess={finish} onSwitchToLogin={() => setMode('login')} />
    : <LoginPage key={`login:${inviteToken}`} invitation={invitation} onSuccess={acceptWithLogin} onSwitchToSignup={() => setMode('signup')} />;
}
