import { useEffect, useMemo, useState } from 'react';
import './App.css';
import LoginPage from './features/login/login.page';
import SignupPage from './features/signup/signup.page';
import DashboardPage from './features/dashboard/dashboard.page';
import { post } from './services/http';
import { endpoints } from './services/endpoints';

const TELEGRAM_TOKEN_STORAGE_KEY = 'spark.telegram-link-token';

function getStoredUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function getPendingTelegramToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || sessionStorage.getItem(TELEGRAM_TOKEN_STORAGE_KEY) || '';
}

function getInitialScreen(hasSessionToken, hasTelegramToken) {
  if (hasSessionToken) {
    return 'dashboard';
  }

  if (window.location.pathname === '/telegram-login') {
    return hasTelegramToken ? 'signup' : 'login';
  }

  return 'login';
}

function App() {
  const initialToken = localStorage.getItem('token') || '';
  const initialTelegramToken = getPendingTelegramToken();
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(getStoredUser);
  const [pendingTelegramToken, setPendingTelegramToken] = useState(initialTelegramToken);
  const [screen, setScreen] = useState(() => getInitialScreen(Boolean(initialToken), Boolean(initialTelegramToken)));
  const [status, setStatus] = useState(
    initialTelegramToken ? 'Finish signup or login to link your Telegram account.' : ''
  );

  const telegramMode = Boolean(pendingTelegramToken);

  useEffect(() => {
    if (window.location.pathname !== '/telegram-login') {
      return;
    }

    const url = new URL(window.location.href);
    const telegramToken = url.searchParams.get('token');
    const storedTelegramToken = sessionStorage.getItem(TELEGRAM_TOKEN_STORAGE_KEY);

    if (telegramToken) {
      sessionStorage.setItem(TELEGRAM_TOKEN_STORAGE_KEY, telegramToken);
      setPendingTelegramToken(telegramToken);
      setStatus('Finish signup or login to link your Telegram account.');
      url.searchParams.delete('token');
      const nextUrl = url.searchParams.size > 0 ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
      window.history.replaceState({}, '', nextUrl);

      if (!localStorage.getItem('token')) {
        setScreen('signup');
      }

      return;
    }

    if (storedTelegramToken) {
      setPendingTelegramToken(storedTelegramToken);
      setStatus('Finish signup or login to link your Telegram account.');

      if (!localStorage.getItem('token')) {
        setScreen('signup');
      }

      return;
    }

    setStatus('Telegram link is missing or expired. Request a new link from the bot.');
  }, []);

  useEffect(() => {
    if (!token || !pendingTelegramToken) {
      return;
    }

    let isActive = true;

    async function linkTelegramAccount() {
      try {
        setStatus('Linking your Telegram account...');
        const result = await post(
          endpoints.linkTelegram,
          { token: pendingTelegramToken },
          { token }
        );

        if (!isActive) {
          return;
        }

        setUser(result.user);
        localStorage.setItem('user', JSON.stringify(result.user));
        sessionStorage.removeItem(TELEGRAM_TOKEN_STORAGE_KEY);
        setPendingTelegramToken('');
        setStatus('Telegram account linked successfully.');

        if (window.location.pathname === '/telegram-login') {
          window.history.replaceState({}, '', '/');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        if ([400, 401, 409].includes(error.statusCode)) {
          sessionStorage.removeItem(TELEGRAM_TOKEN_STORAGE_KEY);
          setPendingTelegramToken('');
        }

        setStatus(`Signed in, but Telegram linking failed: ${error.message}`);
      }
    }

    linkTelegramAccount();

    return () => {
      isActive = false;
    };
  }, [pendingTelegramToken, token]);

  function handleAuthSuccess(result) {
    const accessToken = result.access_token || result.token;

    setToken(accessToken);
    setUser(result.user);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    setScreen('dashboard');
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setStatus(pendingTelegramToken ? 'Finish signup or login to link your Telegram account.' : '');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setScreen(pendingTelegramToken ? 'signup' : 'login');
  }

  const content = useMemo(() => {
    if (screen === 'signup') {
      return (
        <SignupPage
          notice={status}
          onSuccess={handleAuthSuccess}
          onSwitchToLogin={() => setScreen('login')}
          telegramMode={telegramMode}
        />
      );
    }

    if (screen === 'dashboard' && token) {
      return <DashboardPage onLogout={handleLogout} status={status} token={token} user={user} />;
    }

    return (
      <LoginPage
        notice={status}
        onSuccess={handleAuthSuccess}
        onSwitchToSignup={() => setScreen('signup')}
        telegramMode={telegramMode}
      />
    );
  }, [screen, status, telegramMode, token, user]);

  return <main className="app">{content}</main>;
}

export default App;
