import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShowcase from './auth-showcase';
import '../../styles/auth.css';

const THEME_KEY = 'spark.auth-theme';

function initialTheme() {
  try { return sessionStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export default function AuthLayout({ children, signup = false, onSwitch }) {
  const [theme, setTheme] = useState(initialTheme);
  const dark = theme === 'dark';

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    try { sessionStorage.setItem(THEME_KEY, next); } catch { /* Theme also works without storage. */ }
  }

  const formPanel = (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-panel-inner">{children}</div>
    </section>
  );

  return (
    <div className="auth-site auth-site--split" data-theme={theme}>
      <header className="auth-navbar">
        <div className="auth-navbar-inner">
          <Link className="auth-brand" to="/" aria-label="SPARK home">
            <img src="/logo.png" alt="" /><span>SPARK</span>
          </Link>
          <div className="auth-nav-actions">
            <button className="auth-theme-toggle" type="button" onClick={toggleTheme}
              aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} aria-pressed={dark}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
                  : <path d="M20.8 13A8.8 8.8 0 0 1 11 3.2 8.8 8.8 0 1 0 20.8 13Z" />}
              </svg>
            </button>
            <button className="auth-nav-switch" type="button" onClick={onSwitch}>
              {signup ? 'Sign in' : 'Get started'} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </header>
      <div className="auth-page">
        <div className="auth-split-frame">
          {formPanel}
          <AuthShowcase signup={signup} />
        </div>
      </div>
      <footer className="auth-site-footer">
        <span>© {new Date().getFullYear()} SPARK</span>
        <nav aria-label="Legal"><Link to="/privacy-policy">Privacy</Link><Link to="/terms-of-service">Terms</Link><Link to="/contact">Contact</Link></nav>
      </footer>
    </div>
  );
}
