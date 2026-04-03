import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import LoginPage from './features/login/login.page';
import SignupPage from './features/signup/signup.page';
import IntegrationsPage from './pages/Integrations';
import { post } from './services/http';
import { endpoints } from './services/endpoints';

const TELEGRAM_TOKEN_STORAGE_KEY = 'spark.telegram-link-token';
const DashboardPage = lazy(() => import('./features/dashboard/dashboard.page'));

function getStoredUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function getPendingTelegramToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || sessionStorage.getItem(TELEGRAM_TOKEN_STORAGE_KEY) || '';
}

function getOrganizationPreferenceKey(userId) {
  return userId ? `spark.active-organization.${userId}` : '';
}

function getStoredOrganizationPreference(user) {
  const storageKey = getOrganizationPreferenceKey(user?.id);
  return storageKey ? localStorage.getItem(storageKey) || '' : '';
}

function resolveActiveOrganizationId(user, preferredOrganizationId = '') {
  const organizations = Array.isArray(user?.organizations) ? user.organizations : [];

  if (!organizations.length) {
    return '';
  }

  if (preferredOrganizationId && organizations.some((item) => item.id === preferredOrganizationId)) {
    return preferredOrganizationId;
  }

  if (user?.default_organization_id && organizations.some((item) => item.id === user.default_organization_id)) {
    return user.default_organization_id;
  }

  return organizations[0]?.id || '';
}

function getInitialScreen(hasSessionToken, hasTelegramToken, pathname) {
  if (hasSessionToken) {
    return 'dashboard';
  }

  if (pathname === '/telegram-login') {
    return hasTelegramToken ? 'signup' : 'login';
  }

  return 'login';
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialToken = localStorage.getItem('token') || '';
  const initialTelegramToken = getPendingTelegramToken();
  const initialUser = getStoredUser();
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(initialUser);
  const [preferredOrganization, setPreferredOrganization] = useState(() => ({
    userId: initialUser?.id || '',
    organizationId: getStoredOrganizationPreference(initialUser)
  }));
  const [pendingTelegramToken, setPendingTelegramToken] = useState(initialTelegramToken);
  const [screen, setScreen] = useState(() =>
    getInitialScreen(Boolean(initialToken), Boolean(initialTelegramToken), window.location.pathname)
  );
  const [status, setStatus] = useState(
    initialTelegramToken ? 'Finish signup or login to link your Telegram account.' : ''
  );

  const telegramMode = Boolean(pendingTelegramToken);
  const preferredOrganizationId = preferredOrganization.userId === user?.id
    ? preferredOrganization.organizationId
    : getStoredOrganizationPreference(user);
  const activeOrganizationId = resolveActiveOrganizationId(user, preferredOrganizationId);

  useEffect(() => {
    function handleAuthUpdated(event) {
      setToken(event.detail?.token || localStorage.getItem('token') || '');
      setUser(event.detail?.user || getStoredUser());
    }

    function handleAuthExpired() {
      setToken('');
      setUser(null);
      setStatus(pendingTelegramToken ? 'Finish signup or login to link your Telegram account.' : '');
      setScreen(pendingTelegramToken ? 'signup' : 'login');
      navigate(pendingTelegramToken ? '/telegram-login' : '/', { replace: true });
    }

    window.addEventListener('spark-auth-updated', handleAuthUpdated);
    window.addEventListener('spark-auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('spark-auth-updated', handleAuthUpdated);
      window.removeEventListener('spark-auth-expired', handleAuthExpired);
    };
  }, [navigate, pendingTelegramToken]);

  useEffect(() => {
    if (!user?.id || !activeOrganizationId) {
      return;
    }

    localStorage.setItem(getOrganizationPreferenceKey(user.id), activeOrganizationId);
  }, [activeOrganizationId, user]);

  useEffect(() => {
    if (location.pathname !== '/telegram-login') {
      return;
    }

    const url = new URL(window.location.href);
    const telegramToken = url.searchParams.get('token');
    const storedTelegramToken = sessionStorage.getItem(TELEGRAM_TOKEN_STORAGE_KEY);

    if (telegramToken) {
      sessionStorage.setItem(TELEGRAM_TOKEN_STORAGE_KEY, telegramToken);
      url.searchParams.delete('token');
      const nextUrl = url.searchParams.size > 0 ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
      window.history.replaceState({}, '', nextUrl);
      queueMicrotask(() => {
        setPendingTelegramToken(telegramToken);
        setStatus('Finish signup or login to link your Telegram account.');

        if (!localStorage.getItem('token')) {
          setScreen('signup');
        }
      });

      return;
    }

    if (storedTelegramToken) {
      queueMicrotask(() => {
        setPendingTelegramToken(storedTelegramToken);
        setStatus('Finish signup or login to link your Telegram account.');

        if (!localStorage.getItem('token')) {
          setScreen('signup');
        }
      });

      return;
    }

    queueMicrotask(() => {
      setStatus('Telegram link is missing or expired. Request a new link from the bot.');
    });
  }, [location.pathname]);

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

        if (location.pathname === '/telegram-login') {
          navigate('/', { replace: true });
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
  }, [location.pathname, navigate, pendingTelegramToken, token]);

  function handleAuthSuccess(result) {
    const accessToken = result.access_token || result.token;
    const refreshToken = result.refresh_token || '';
    const shouldClearTelegramToken = pendingTelegramToken && result.user?.telegram_id;

    setToken(accessToken);
    setUser(result.user);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    setScreen('dashboard');

    if (shouldClearTelegramToken) {
      sessionStorage.removeItem(TELEGRAM_TOKEN_STORAGE_KEY);
      setPendingTelegramToken('');
      setStatus('Telegram account linked successfully.');
      navigate('/', { replace: true });
      return;
    }

    if (location.pathname === '/integrations') {
      navigate('/integrations', { replace: true });
      return;
    }

    navigate('/', { replace: true });
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setPreferredOrganization({ userId: '', organizationId: '' });
    setStatus(pendingTelegramToken ? 'Finish signup or login to link your Telegram account.' : '');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setScreen(pendingTelegramToken ? 'signup' : 'login');
    navigate(pendingTelegramToken ? '/telegram-login' : '/', { replace: true });
  }

  function handleSelectOrganization(nextOrganizationId) {
    setPreferredOrganization({
      userId: user?.id || '',
      organizationId: nextOrganizationId
    });
  }

  const authContent = screen === 'signup' ? (
    <SignupPage
      notice={status}
      onSuccess={handleAuthSuccess}
      onSwitchToLogin={() => setScreen('login')}
      telegramToken={pendingTelegramToken}
      telegramMode={telegramMode}
    />
  ) : (
    <LoginPage
      notice={status}
      onSuccess={handleAuthSuccess}
      onSwitchToSignup={() => setScreen('signup')}
      telegramMode={telegramMode}
    />
  );

  const dashboardContent = (
    <Suspense fallback={<div className="card">Loading dashboard...</div>}>
      <DashboardPage
        activeOrganizationId={activeOrganizationId}
        onSelectOrganization={handleSelectOrganization}
        onLogout={handleLogout}
        onOpenIntegrations={() => navigate('/integrations')}
        status={status}
        token={token}
        user={user}
      />
    </Suspense>
  );

  const isDashboardSurface = token && location.pathname !== '/integrations';

  return (
    <main className={isDashboardSurface ? 'app app-dashboard' : 'app'}>
      <Routes>
        <Route
          path="/integrations"
          element={
            token ? (
              <IntegrationsPage
                activeOrganizationId={activeOrganizationId}
                onSelectOrganization={handleSelectOrganization}
                onBack={() => navigate('/')}
                onLogout={handleLogout}
                token={token}
                user={user}
              />
            ) : (
              authContent
            )
          }
        />
        <Route path="/telegram-login" element={token ? dashboardContent : authContent} />
        <Route path="/" element={token ? dashboardContent : authContent} />
        <Route path="*" element={<Navigate replace to={token ? '/' : '/'} />} />
      </Routes>
    </main>
  );
}

export default App;
