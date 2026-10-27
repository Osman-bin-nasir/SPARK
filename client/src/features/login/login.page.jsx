import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../../services/http';
import { endpoints } from '../../services/endpoints';
import AuthLayout from '../auth/auth-layout';

const TELEGRAM_BOT_URL = 'https://t.me/osman80bot';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.8 3.5M6.3 7.6A17 17 0 0 0 2.5 12S6 18 12 18a9.5 9.5 0 0 0 3.2-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 4 3 11l5 2 2 6 3.2-3.6L18 19l3-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8 13 9-6-6.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoginPage({ onSuccess, onSwitchToSignup, notice, telegramMode, whatsappMode, invitation }) {
  const [email, setEmail] = useState(invitation?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const botMode = Boolean(telegramMode || whatsappMode);
  const eyebrow = 'SPARK';
  const title = invitation ? `Join ${invitation.organization_name}` : telegramMode
    ? 'Link your Telegram'
    : whatsappMode
      ? 'Link your WhatsApp'
      : 'Welcome back';
  const subtitle = invitation ? `Sign in to accept your invitation as ${invitation.role}.` : telegramMode
    ? 'Sign in to link your Telegram.'
    : whatsappMode
      ? 'Sign in to link your WhatsApp.'
      : 'Sign in to your workspace.';
  const submitLabel = loading
    ? 'Signing in…'
    : telegramMode
      ? 'Sign in and link Telegram'
      : whatsappMode
        ? 'Sign in and link WhatsApp'
        : 'Sign in';

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const result = await post(endpoints.login, { email, password });
      await onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout onSwitch={onSwitchToSignup}>
          <p className="auth-form-eyebrow">{eyebrow}</p>
          <h2 className="auth-title" id="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>

          {notice && (
            <p className="auth-message is-notice" role="status" aria-live="polite">
              {notice}
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-email">Email</label>
              <div className="auth-input-wrap">
                <input
                  className="auth-input"
                  id="auth-email"
                  name="email"
                  type="email"
                  value={email}
                  readOnly={Boolean(invitation)}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <input
                  className="auth-input has-toggle"
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <p className="auth-message is-error" role="alert">
                {error}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading && <span className="auth-spinner" aria-hidden="true" />}
              <span>{submitLabel}</span>
            </button>
          </form>

          {!botMode && !invitation && (
            <>
              <div className="auth-divider">or</div>
              <a
                className="auth-alt"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
              >
                <TelegramIcon />
                Continue in Telegram
              </a>
            </>
          )}

          <p className="auth-footer-note">
            {botMode ? 'New here? ' : 'New to SPARK? '}
            <button type="button" className="auth-link" onClick={onSwitchToSignup}>
              Create an account
            </button>
          </p>

          <p className="auth-legal">
            By continuing, you agree to our{' '}
            <Link to="/terms-of-service">Terms</Link>
            {' '}and{' '}
            <Link to="/privacy-policy">Privacy Policy</Link>
            .
          </p>

    </AuthLayout>
  );
}

export default LoginPage;
