import { useMemo, useState } from 'react';
import './App.css';
import LoginPage from './features/login/login.page';
import SignupPage from './features/signup/signup.page';
import DashboardPage from './features/dashboard/dashboard.page';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [screen, setScreen] = useState(token ? 'dashboard' : 'login');

  function handleAuthSuccess(result) {
    setToken(result.token);
    setUser(result.user);
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    setScreen('dashboard');
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setScreen('login');
  }

  const content = useMemo(() => {
    if (screen === 'signup') {
      return <SignupPage onSuccess={handleAuthSuccess} onSwitchToLogin={() => setScreen('login')} />;
    }

    if (screen === 'dashboard' && token) {
      return <DashboardPage user={user} token={token} onLogout={handleLogout} />;
    }

    return <LoginPage onSuccess={handleAuthSuccess} onSwitchToSignup={() => setScreen('signup')} />;
  }, [screen, token, user]);

  return <main className="app">{content}</main>;
}

export default App;
