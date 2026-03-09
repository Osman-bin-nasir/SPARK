import { useState } from 'react';
import { post } from '../../services/http';
import { endpoints } from '../../services/endpoints';

function SignupPage({ onSuccess, onSwitchToLogin, notice, telegramMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await post(endpoints.register, { email, password });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>{telegramMode ? 'Create account to continue' : 'Create account'}</h1>
      {notice && <p className="notice">{notice}</p>}
      <form onSubmit={handleSubmit}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          required
          minLength={8}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : telegramMode ? 'Sign up and link Telegram' : 'Sign up'}
        </button>
      </form>
      <p>
        Already have an account? <button type="button" className="link-btn" onClick={onSwitchToLogin}>Login</button>
      </p>
    </div>
  );
}

export default SignupPage;
