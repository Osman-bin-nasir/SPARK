import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import LoginPage from './features/login/login.page';
import SignupPage from './features/signup/signup.page';
import IntegrationsPage from './pages/Integrations';
import AppShell from './components/layout/app-shell';
import TransactionsPage from './pages/Transactions';
import ApprovalsPage from './pages/Approvals';
import AnalyticsPage from './pages/Analytics';
import FinancePage from './pages/Finance';
import TeamPage from './pages/Team';
import SettingsPage from './pages/Settings';
import PrivacyPolicyPage from './pages/PrivacyPolicy';
import TermsOfServicePage from './pages/TermsOfService';
import ContactPage from './pages/Contact';
import LandingPage from './pages/Landing';
import { post } from './services/http';
import { endpoints } from './services/endpoints';
import {
  getUserSettings,
  getUserSettingsEventName,
  getUserSettingsStorageKey,
  persistUserSettings
} from './lib/user-settings';

const TELEGRAM_TOKEN_STORAGE_KEY = 'spark.telegram-link-token';
const WHATSAPP_TOKEN_STORAGE_KEY = 'spark.whatsapp-link-token';
const DashboardPage = lazy(() => import('./features/dashboard/dashboard.page'));

function getStoredUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function getPendingTelegramToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || sessionStorage.getItem(TELEGRAM_TOKEN_STORAGE_KEY) || '';
}

function getPendingWhatsappToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || sessionStorage.getItem(WHATSAPP_TOKEN_STORAGE_KEY) || '';
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

function getInitialScreen(hasSessionToken, hasTelegramToken, hasWhatsappToken, pathname) {
  if (hasSessionToken) {
    return 'dashboard';
  }

  if (pathname === '/telegram-login') {
    return hasTelegramToken ? 'signup' : 'login';
  }

  if (pathname === '/whatsapp-login') {
    return hasWhatsappToken ? 'signup' : 'login';
  }

  return 'login';
}

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPathname = normalizePathname(location.pathname);
  const initialToken = localStorage.getItem('token') || '';
  const initialTelegramToken = getPendingTelegramToken();
  const initialWhatsappToken = getPendingWhatsappToken();
  const initialUser = getStoredUser();
  const initialUserSettings = getUserSettings(initialUser);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(initialUser);
  const [userSettings, setUserSettings] = useState(initialUserSettings);
  const [preferredOrganization, setPreferredOrganization] = useState(() => ({
    userId: initialUser?.id || '',
    organizationId: getStoredOrganizationPreference(initialUser)
  }));
  const [pendingTelegramToken, setPendingTelegramToken] = useState(initialTelegramToken);
  const [pendingWhatsappToken, setPendingWhatsappToken] = useState(initialWhatsappToken);
  const [screen, setScreen] = useState(() =>
    getInitialScreen(
      Boolean(initialToken),
      Boolean(initialTelegramToken),
      Boolean(initialWhatsappToken),
      window.location.pathname
    )
  );
  const [status, setStatus] = useState(
    initialTelegramToken
      ? 'Finish signup or login to link your Telegram account.'
      : initialWhatsappToken
      ? 'Finish signup or login to link your WhatsApp account.'
      : ''
  );
  const isDarkMode = userSettings.theme_mode === 'dark';

  useEffect(() => {
    setUserSettings(getUserSettings(user));
  }, [user?.id]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    document.documentElement.dataset.density = userSettings.interface_density;
    document.documentElement.dataset.contentWidth = userSettings.content_width;
    document.documentElement.classList.toggle('reduced-motion', userSettings.reduce_motion);
  }, [
    isDarkMode,
    userSettings.content_width,
    userSettings.interface_density,
    userSettings.reduce_motion
  ]);

  useEffect(() => {
    const handleUserSettingsUpdate = (event) => {
      if (event.detail?.userId && event.detail.userId === user?.id) {
        setUserSettings(event.detail.settings || getUserSettings(user));
      }
    };

    const handleStorage = (event) => {
      const settingsKey = getUserSettingsStorageKey(user?.id);

      if (!settingsKey || event.key !== settingsKey) {
        return;
      }

      setUserSettings(getUserSettings(user));
    };

    window.addEventListener(getUserSettingsEventName(), handleUserSettingsUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(getUserSettingsEventName(), handleUserSettingsUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user]);

  function updateUserSettings(partialSettings) {
    const nextSettings = persistUserSettings(user, {
      ...userSettings,
      ...partialSettings
    });

    setUserSettings(nextSettings);
  }

  const toggleTheme = () => {
    updateUserSettings({
      theme_mode: isDarkMode ? 'light' : 'dark'
    });
  };

  const telegramMode = Boolean(pendingTelegramToken);
  const whatsappMode = Boolean(pendingWhatsappToken);
  const botMode = telegramMode || whatsappMode;
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
      setStatus(
        pendingTelegramToken
          ? 'Finish signup or login to link your Telegram account.'
          : pendingWhatsappToken
          ? 'Finish signup or login to link your WhatsApp account.'
          : ''
      );
      setScreen(botMode ? 'signup' : 'login');
      navigate(
        pendingTelegramToken
          ? '/telegram-login'
          : pendingWhatsappToken
          ? '/whatsapp-login'
          : '/login',
        { replace: true }
      );
    }

    window.addEventListener('spark-auth-updated', handleAuthUpdated);
    window.addEventListener('spark-auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('spark-auth-updated', handleAuthUpdated);
      window.removeEventListener('spark-auth-expired', handleAuthExpired);
    };
  }, [navigate, pendingTelegramToken, pendingWhatsappToken, botMode]);

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
    if (location.pathname !== '/whatsapp-login') {
      return;
    }

    const url = new URL(window.location.href);
    const whatsappToken = url.searchParams.get('token');
    const storedWhatsappToken = sessionStorage.getItem(WHATSAPP_TOKEN_STORAGE_KEY);

    if (whatsappToken) {
      sessionStorage.setItem(WHATSAPP_TOKEN_STORAGE_KEY, whatsappToken);
      url.searchParams.delete('token');
      const nextUrl = url.searchParams.size > 0 ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
      window.history.replaceState({}, '', nextUrl);
      queueMicrotask(() => {
        setPendingWhatsappToken(whatsappToken);
        setStatus('Finish signup or login to link your WhatsApp account.');

        if (!localStorage.getItem('token')) {
          setScreen('signup');
        }
      });

      return;
    }

    if (storedWhatsappToken) {
      queueMicrotask(() => {
        setPendingWhatsappToken(storedWhatsappToken);
        setStatus('Finish signup or login to link your WhatsApp account.');

        if (!localStorage.getItem('token')) {
          setScreen('signup');
        }
      });

      return;
    }

    queueMicrotask(() => {
      setStatus('WhatsApp link is missing or expired. Request a new link from the bot.');
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
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        sessionStorage.removeItem(TELEGRAM_TOKEN_STORAGE_KEY);
        setPendingTelegramToken('');
        setStatus(`Signed in, but Telegram linking failed: ${error.message}`);

        if (location.pathname === '/telegram-login') {
          navigate('/dashboard', { replace: true });
        }
      }
    }

    linkTelegramAccount();

    return () => {
      isActive = false;
    };
  }, [location.pathname, navigate, pendingTelegramToken, token]);

  useEffect(() => {
    if (!token || !pendingWhatsappToken) {
      return;
    }

    let isActive = true;

    async function linkWhatsappAccount() {
      try {
        setStatus('Linking your WhatsApp account...');
        const result = await post(
          endpoints.linkWhatsapp,
          { token: pendingWhatsappToken },
          { token }
        );

        if (!isActive) {
          return;
        }

        setUser(result.user);
        localStorage.setItem('user', JSON.stringify(result.user));
        sessionStorage.removeItem(WHATSAPP_TOKEN_STORAGE_KEY);
        setPendingWhatsappToken('');
        setStatus('WhatsApp account linked successfully.');

        if (location.pathname === '/whatsapp-login') {
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        sessionStorage.removeItem(WHATSAPP_TOKEN_STORAGE_KEY);
        setPendingWhatsappToken('');
        setStatus(`Signed in, but WhatsApp linking failed: ${error.message}`);

        if (location.pathname === '/whatsapp-login') {
          navigate('/dashboard', { replace: true });
        }
      }
    }

    linkWhatsappAccount();

    return () => {
      isActive = false;
    };
  }, [location.pathname, navigate, pendingWhatsappToken, token]);

  function handleAuthSuccess(result) {
    const accessToken = result.access_token || result.token;
    const refreshToken = result.refresh_token || '';
    const shouldClearTelegramToken = pendingTelegramToken && result.user?.telegram_id;
    const shouldClearWhatsappToken = pendingWhatsappToken && result.user?.whatsapp_id;

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
      navigate('/dashboard', { replace: true });
      return;
    }

    if (shouldClearWhatsappToken) {
      sessionStorage.removeItem(WHATSAPP_TOKEN_STORAGE_KEY);
      setPendingWhatsappToken('');
      setStatus('WhatsApp account linked successfully.');
      navigate('/dashboard', { replace: true });
      return;
    }

    if (pendingTelegramToken || pendingWhatsappToken) {
      // Let the link useEffect finish and handle navigation
      return;
    }

    if (location.pathname === '/integrations') {
      navigate('/integrations', { replace: true });
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setUserSettings(getUserSettings(null));
    setPreferredOrganization({ userId: '', organizationId: '' });
    setStatus(
      pendingTelegramToken
        ? 'Finish signup or login to link your Telegram account.'
        : pendingWhatsappToken
        ? 'Finish signup or login to link your WhatsApp account.'
        : ''
    );
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setScreen(botMode ? 'signup' : 'login');
    navigate(
      pendingTelegramToken
        ? '/telegram-login'
        : pendingWhatsappToken
        ? '/whatsapp-login'
        : '/login',
      { replace: true }
    );
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
      whatsappToken={pendingWhatsappToken}
      whatsappMode={whatsappMode}
    />
  ) : (
    <LoginPage
      notice={status}
      onSuccess={handleAuthSuccess}
      onSwitchToSignup={() => setScreen('signup')}
      telegramMode={telegramMode}
      whatsappMode={whatsappMode}
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

  const isDashboardSurface = token;

  const publicPageByPath = {
    '/privacy-policy': <PrivacyPolicyPage />,
    '/privacy-policy.html': <PrivacyPolicyPage />,
    '/terms-of-service': <TermsOfServicePage />,
    '/terms-of-service.html': <TermsOfServicePage />,
    '/contact': <ContactPage />,
    '/contact.html': <ContactPage />
  };

  if (publicPageByPath[normalizedPathname]) {
    return publicPageByPath[normalizedPathname];
  }

  if (normalizedPathname === '/') {
    return <LandingPage isAuthenticated={Boolean(token)} />;
  }

  if (normalizedPathname === '/login') {
    return <main className="app">{authContent}</main>;
  }

  const renderAuthenticatedRoutes = () => (
    <AppShell 
      user={user}
      activeOrganizationId={activeOrganizationId}
      organizations={user?.organizations || []}
      onSelectOrganization={handleSelectOrganization}
      onLogout={handleLogout}
      isDarkMode={isDarkMode}
      showTopbarSearch={userSettings.show_topbar_search}
      contentWidth={userSettings.content_width}
      toggleTheme={toggleTheme}
    >
      <Routes>
        <Route path="/dashboard" element={dashboardContent} />
        <Route path="/telegram-login" element={dashboardContent} />
        <Route path="/whatsapp-login" element={dashboardContent} />
        <Route
          path="/integrations"
          element={
            <IntegrationsPage
              activeOrganizationId={activeOrganizationId}
              onSelectOrganization={handleSelectOrganization}
              onOpenTeam={() => navigate('/team')}
              onLogout={handleLogout}
              token={token}
              user={user}
              onUpdateUser={(updatedUser) => {
                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
              }}
            />
          }
        />
        <Route
          path="/transactions"
          element={
            <TransactionsPage
              activeOrganizationId={activeOrganizationId}
              token={token}
              user={user}
              userSettings={userSettings}
            />
          }
        />
        <Route
          path="/approvals"
          element={
            <ApprovalsPage
              activeOrganizationId={activeOrganizationId}
              token={token}
              user={user}
            />
          }
        />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route
          path="/finance"
          element={
            <FinancePage
              activeOrganizationId={activeOrganizationId}
              token={token}
              user={user}
            />
          }
        />
        <Route path="/team" element={<TeamPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              user={user}
              activeOrganizationId={activeOrganizationId}
              organizations={user?.organizations || []}
              onSelectOrganization={handleSelectOrganization}
              userSettings={userSettings}
              onUpdateUserSettings={updateUserSettings}
            />
          }
        />
        <Route path="*" element={<Navigate replace to="/dashboard" />} />
      </Routes>
    </AppShell>
  );

  const renderUnauthenticatedRoutes = () => (
    <Routes>
      <Route path="/telegram-login" element={authContent} />
      <Route path="/whatsapp-login" element={authContent} />
      <Route path="/login" element={authContent} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );

  return (
    <main className={isDashboardSurface ? 'app app-dashboard' : 'app'}>
      {token ? renderAuthenticatedRoutes() : renderUnauthenticatedRoutes()}
    </main>
  );
}

export default App;
