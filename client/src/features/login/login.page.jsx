import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../../services/http';
import { endpoints } from '../../services/endpoints';

function LoginPage({ onSuccess, onSwitchToSignup, notice, telegramMode, whatsappMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const botMode = telegramMode || whatsappMode;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await post(endpoints.login, { email, password });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">
        {telegramMode
          ? 'Telegram Access'
          : whatsappMode
          ? 'WhatsApp Access'
          : 'SPARK Finance'}
      </p>
      <h1>{botMode ? 'Log in to continue' : 'Login'}</h1>
      <p className="card-subtitle">
        {telegramMode
          ? 'Use your existing SPARK account to connect this Telegram identity.'
          : whatsappMode
          ? 'Use your existing SPARK account to connect this WhatsApp identity.'
          : 'Review receipts, approvals, and finance activity from a single workspace.'}
      </p>
      {notice && <p className="notice">{notice}</p>}
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@spark.ai" type="email" required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading
            ? 'Signing in...'
            : telegramMode
            ? 'Login and link Telegram'
            : whatsappMode
            ? 'Login and link WhatsApp'
            : 'Login'}
        </button>
      </form>
      <p className="auth-footer">
        No account? <button type="button" className="link-btn" onClick={onSwitchToSignup}>Sign up</button>
      </p>
      <p className="legal-copy">
        By continuing, you agree to the{' '}
        <Link className="legal-link" to="/terms-of-service">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link className="legal-link" to="/privacy-policy">
          Privacy Policy
        </Link>
        . Need help?{' '}
        <Link className="legal-link" to="/contact">
          Contact SPARK
        </Link>
        .
      </p>
    </div>
  );
}

export default LoginPage;
