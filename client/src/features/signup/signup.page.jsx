import { useState } from 'react';
import { post } from '../../services/http';
import { endpoints } from '../../services/endpoints';

function SignupPage({ onSuccess, onSwitchToLogin, notice, telegramMode, telegramToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { email, password };

      if (telegramToken) {
        payload.telegram_token = telegramToken;
      }

      const result = await post(endpoints.register, payload);
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">{telegramMode ? 'Telegram Access' : 'SPARK Finance'}</p>
      <h1>{telegramMode ? 'Create account to continue' : 'Create account'}</h1>
      <p className="card-subtitle">
        {telegramMode
          ? 'Create your SPARK account and attach it to the Telegram bot in one step.'
          : 'Set up a web account for dashboards, month close, and receipt intelligence.'}
      </p>
      {notice && <p className="notice">{notice}</p>}
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Work Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="finance@spark.ai" type="email" required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            type="password"
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : telegramMode ? 'Sign up and link Telegram' : 'Sign up'}
        </button>
      </form>
      <p className="auth-footer">
        Already have an account? <button type="button" className="link-btn" onClick={onSwitchToLogin}>Login</button>
      </p>
    </div>
  );
}

export default SignupPage;
