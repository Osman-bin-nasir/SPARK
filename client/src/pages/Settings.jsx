import { useEffect, useMemo, useState } from 'react';
import '../styles/dashboard.css';

const GOOGLE_SHEET_RANGE_OPTIONS = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' }
];

const TRANSACTION_PAGE_SIZE_OPTIONS = [25, 50, 100];

function formatRole(role) {
  const normalizedRole = String(role || 'member').replace(/_/g, ' ');
  return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
}

function SummaryStat({ label, value, tone = 'default' }) {
  return (
    <div className={`settings-summary-stat settings-summary-stat--${tone}`}>
      <span className="settings-summary-label">{label}</span>
      <strong className="settings-summary-value">{value}</strong>
    </div>
  );
}

function SettingRow({ title, description, children }) {
  return (
    <div className="settings-row">
      <div>
        <h4 className="settings-row-title">{title}</h4>
        <p className="settings-row-description">{description}</p>
      </div>
      <div className="settings-row-control">
        {children}
      </div>
    </div>
  );
}

function ThemeButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      className={`settings-choice-btn ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

export default function SettingsPage({
  user,
  activeOrganizationId,
  organizations,
  onSelectOrganization,
  userSettings,
  onUpdateUserSettings
}) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.id === activeOrganizationId) || organizations[0] || null,
    [activeOrganizationId, organizations]
  );

  const enabledAlerts = [
    userSettings?.email_notifications,
    userSettings?.unusual_spend_alerts,
    userSettings?.monthly_close_reminders
  ].filter(Boolean).length;

  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, [userSettings]);

  function handleSettingChange(key, value) {
    if (typeof onUpdateUserSettings === 'function') {
      onUpdateUserSettings({ [key]: value });
    }
  }

  return (
    <div className="premium-page-container">
      <style>
        {`
          .settings-grid {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            gap: 24px;
          }
          .settings-card {
            height: 100%;
          }
          .settings-card-body {
            padding: 22px 24px 24px;
          }
          .settings-card--hero {
            grid-column: span 12;
            padding: 28px;
            background:
              radial-gradient(circle at top right, rgba(37, 99, 235, 0.14), transparent 36%),
              linear-gradient(135deg, var(--card), var(--panel-soft));
          }
          .settings-card--half {
            grid-column: span 6;
          }
          .settings-card--full {
            grid-column: span 12;
          }
          .settings-hero-eyebrow {
            margin: 0 0 10px;
            color: var(--accent-blue);
            font-size: 0.74rem;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .settings-hero-title {
            margin: 0;
            font-size: clamp(1.9rem, 3vw, 2.4rem);
            letter-spacing: -0.04em;
          }
          .settings-hero-copy {
            max-width: 760px;
            margin: 14px 0 0;
            color: var(--text-secondary);
            line-height: 1.7;
            font-size: 0.96rem;
          }
          .settings-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
            margin-top: 24px;
          }
          .settings-summary-stat {
            border-radius: 14px;
            border: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.03);
            padding: 16px;
            display: grid;
            gap: 8px;
          }
          .settings-summary-stat--success {
            border-color: rgba(34, 197, 94, 0.24);
            background: rgba(34, 197, 94, 0.08);
          }
          .settings-summary-stat--info {
            border-color: rgba(37, 99, 235, 0.22);
            background: rgba(37, 99, 235, 0.08);
          }
          .settings-summary-label {
            color: var(--text-secondary);
            font-size: 0.76rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .settings-summary-value {
            font-size: 1rem;
            line-height: 1.35;
            color: var(--text-primary);
          }
          .settings-autosave {
            margin-top: 18px;
            color: var(--text-secondary);
            font-size: 0.88rem;
          }
          .settings-stack {
            display: grid;
            gap: 18px;
          }
          .settings-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .settings-field {
            display: grid;
            gap: 8px;
          }
          .settings-label {
            color: var(--text-secondary);
            font-size: 0.76rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .settings-input,
          .settings-select {
            width: 100%;
            height: 46px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--text-primary);
            padding: 0 14px;
            font-size: 0.92rem;
          }
          .settings-help {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.82rem;
            line-height: 1.6;
          }
          .settings-field--span-2 {
            grid-column: span 2;
          }
          .settings-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            padding: 18px 0;
            border-top: 1px solid var(--border);
          }
          .settings-row:first-of-type {
            padding-top: 0;
            border-top: none;
          }
          .settings-row-title {
            margin: 0 0 6px;
            font-size: 0.98rem;
          }
          .settings-row-description {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.86rem;
            line-height: 1.6;
            max-width: 540px;
          }
          .settings-row-control {
            min-width: 220px;
            display: flex;
            justify-content: flex-end;
          }
          .settings-choice-group {
            display: inline-flex;
            gap: 10px;
            flex-wrap: wrap;
          }
          .settings-choice-btn {
            min-width: 110px;
            height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 0 16px;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--text-primary);
            font-size: 0.9rem;
            font-weight: 600;
          }
          .settings-choice-btn.is-active {
            background: var(--accent-blue);
            border-color: var(--accent-blue);
            color: #ffffff;
          }
          .settings-panel-note {
            margin: 0;
            padding: 14px 16px;
            border-radius: 12px;
            border: 1px solid rgba(37, 99, 235, 0.14);
            background: rgba(37, 99, 235, 0.06);
            color: var(--text-secondary);
            font-size: 0.88rem;
            line-height: 1.65;
          }
          .settings-live-list {
            display: grid;
            gap: 14px;
          }
          .settings-live-item {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--border);
          }
          .settings-live-item:last-child {
            padding-bottom: 0;
            border-bottom: none;
          }
          .settings-live-item-label {
            color: var(--text-secondary);
            font-size: 0.85rem;
          }
          .settings-live-item-value {
            color: var(--text-primary);
            font-weight: 600;
            text-align: right;
          }
          .settings-danger-btn {
            background: transparent;
            border: 1px solid rgba(239, 68, 68, 0.28);
            color: var(--accent-red);
            padding: 12px 18px;
            border-radius: 10px;
            font-weight: 600;
          }
          .settings-danger-btn:hover:not(:disabled) {
            background: rgba(239, 68, 68, 0.08);
          }
          @media (max-width: 1100px) {
            .settings-card--half {
              grid-column: span 12;
            }
            .settings-summary-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (max-width: 760px) {
            .settings-fields {
              grid-template-columns: 1fr;
            }
            .settings-field--span-2 {
              grid-column: span 1;
            }
            .settings-summary-grid {
              grid-template-columns: 1fr;
            }
            .settings-row {
              flex-direction: column;
            }
            .settings-row-control {
              min-width: 0;
              width: 100%;
              justify-content: flex-start;
            }
            .settings-choice-group {
              width: 100%;
            }
            .settings-choice-btn {
              flex: 1 1 0;
            }
          }
        `}
      </style>

      <div className="settings-grid">
        <div className="premium-card settings-card settings-card--hero">
          <p className="settings-hero-eyebrow">Dynamic Workspace Settings</p>
          <h2 className="settings-hero-title">Preferences update instantly across your workspace.</h2>
          <p className="settings-hero-copy">
            This page is now tied to live app state. As you change theme, density, layout behavior, alerts, and transaction defaults, SPARK saves the preference for your account and reflects it immediately.
          </p>
          <div className="settings-summary-grid">
            <SummaryStat label="Display Name" value={userSettings?.display_name || 'Workspace User'} tone="info" />
            <SummaryStat label="Active Org" value={activeOrganization?.name || 'No organization'} tone="success" />
            <SummaryStat label="Theme & Density" value={`${formatRole(userSettings?.theme_mode)} · ${formatRole(userSettings?.interface_density)}`} />
            <SummaryStat label="Alerts Enabled" value={`${enabledAlerts}/3 active`} />
          </div>
          <p className="settings-autosave">
            Saved automatically. Last updated at {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
          </p>
        </div>

        <div className="premium-card settings-card settings-card--half">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Profile & Workspace</h3>
          </div>
          <div className="settings-card-body settings-stack">
            <div className="settings-fields">
              <div className="settings-field">
                <label className="settings-label" htmlFor="display-name">Display Name</label>
                <input
                  id="display-name"
                  className="settings-input"
                  type="text"
                  value={userSettings?.display_name || ''}
                  onChange={(event) => handleSettingChange('display_name', event.target.value)}
                />
                <p className="settings-help">Shown as your personal workspace label on this device.</p>
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="active-organization">Active Organization</label>
                <select
                  id="active-organization"
                  className="settings-select"
                  value={activeOrganizationId || ''}
                  onChange={(event) => onSelectOrganization && onSelectOrganization(event.target.value)}
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <p className="settings-help">Changing this switches org-scoped pages and data immediately.</p>
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="email-address">Email Address</label>
                <input
                  id="email-address"
                  className="settings-input"
                  type="text"
                  value={user?.email || 'No email on file'}
                  disabled
                />
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="current-role">Current Role</label>
                <input
                  id="current-role"
                  className="settings-input"
                  type="text"
                  value={activeOrganization ? `${formatRole(activeOrganization.role)} in ${activeOrganization.name}` : 'No active role'}
                  disabled
                />
              </div>

              <div className="settings-field settings-field--span-2">
                <p className="settings-panel-note">
                  Live workspace data updates as your session changes. Organization selection here uses the same shared app state as the top bar, so the change applies instantly everywhere that reads the active org.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="premium-card settings-card settings-card--half">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Interface & Live Behavior</h3>
          </div>
          <div className="settings-card-body">
            <SettingRow
              title="Theme Mode"
              description="Switch between light and dark instantly. The app shell updates as soon as you choose."
            >
              <div className="settings-choice-group">
                <ThemeButton
                  active={userSettings?.theme_mode === 'light'}
                  label="Light"
                  onClick={() => handleSettingChange('theme_mode', 'light')}
                />
                <ThemeButton
                  active={userSettings?.theme_mode === 'dark'}
                  label="Dark"
                  onClick={() => handleSettingChange('theme_mode', 'dark')}
                />
              </div>
            </SettingRow>

            <SettingRow
              title="Interface Density"
              description="Compact mode tightens the sidebar, top bar, and content spacing in real time."
            >
              <select
                className="settings-select"
                value={userSettings?.interface_density || 'comfortable'}
                onChange={(event) => handleSettingChange('interface_density', event.target.value)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Content Width"
              description="Widen the workspace canvas for dense dashboards and large tables."
            >
              <select
                className="settings-select"
                value={userSettings?.content_width || 'standard'}
                onChange={(event) => handleSettingChange('content_width', event.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Top Bar Search"
              description="Show or hide the search input in the global app shell immediately."
            >
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(userSettings?.show_topbar_search)}
                  onChange={(event) => handleSettingChange('show_topbar_search', event.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              title="Reduce Motion"
              description="Minimize interface transitions and animations for a calmer experience."
            >
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(userSettings?.reduce_motion)}
                  onChange={(event) => handleSettingChange('reduce_motion', event.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </SettingRow>
          </div>
        </div>

        <div className="premium-card settings-card settings-card--half">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Alerts & Preferences</h3>
          </div>
          <div className="settings-card-body">
            <SettingRow
              title="Email Notifications"
              description="Receive daily account activity summaries."
            >
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(userSettings?.email_notifications)}
                  onChange={(event) => handleSettingChange('email_notifications', event.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              title="Unusual Spend Alerts"
              description="Get alerted when transaction activity breaks from normal patterns."
            >
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(userSettings?.unusual_spend_alerts)}
                  onChange={(event) => handleSettingChange('unusual_spend_alerts', event.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              title="Month-Close Reminders"
              description="Enable reminders when it is time to review and close out the period."
            >
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(userSettings?.monthly_close_reminders)}
                  onChange={(event) => handleSettingChange('monthly_close_reminders', event.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </SettingRow>
          </div>
        </div>

        <div className="premium-card settings-card settings-card--half">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Transaction View Defaults</h3>
          </div>
          <div className="settings-card-body settings-fields">
            <div className="settings-field">
              <label className="settings-label" htmlFor="sheet-range">Default Google Sheets Range</label>
              <select
                id="sheet-range"
                className="settings-select"
                value={userSettings?.default_google_sheet_range || '1m'}
                onChange={(event) => handleSettingChange('default_google_sheet_range', event.target.value)}
              >
                {GOOGLE_SHEET_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="settings-help">Used as the default range on the Transactions page for Google Sheets sync.</p>
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="page-size">Transactions Page Size</label>
              <select
                id="page-size"
                className="settings-select"
                value={userSettings?.transactions_page_size || 50}
                onChange={(event) => handleSettingChange('transactions_page_size', Number(event.target.value))}
              >
                {TRANSACTION_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
              <p className="settings-help">Applies to transaction list pagination the next time the page renders.</p>
            </div>

            <div className="settings-field settings-field--span-2">
              <p className="settings-panel-note">
                These defaults are stored per user. They are separate from database records, so changing them only affects how you view and navigate transaction data.
              </p>
            </div>
          </div>
        </div>

        <div className="premium-card settings-card settings-card--full">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Live Session Snapshot</h3>
          </div>
          <div className="settings-card-body settings-live-list">
            <div className="settings-live-item">
              <span className="settings-live-item-label">Session Email</span>
              <span className="settings-live-item-value">{user?.email || 'Not available'}</span>
            </div>
            <div className="settings-live-item">
              <span className="settings-live-item-label">Organizations Available</span>
              <span className="settings-live-item-value">{organizations.length}</span>
            </div>
            <div className="settings-live-item">
              <span className="settings-live-item-label">Telegram Linked</span>
              <span className="settings-live-item-value">{user?.telegram_id ? 'Connected' : 'Not linked'}</span>
            </div>
            <div className="settings-live-item">
              <span className="settings-live-item-label">Current Theme</span>
              <span className="settings-live-item-value">{formatRole(userSettings?.theme_mode)}</span>
            </div>
            <div className="settings-live-item">
              <span className="settings-live-item-label">Workspace Layout</span>
              <span className="settings-live-item-value">
                {formatRole(userSettings?.interface_density)} · {formatRole(userSettings?.content_width)}
              </span>
            </div>
          </div>
        </div>

        <div className="premium-card settings-card settings-card--full">
          <div className="premium-card-header">
            <h3 className="premium-card-title">Security & Danger Zone</h3>
          </div>
          <div className="settings-card-body">
            <p className="settings-panel-note">
              Account deletion is still gated behind a server-side flow. For now this panel stays informational, while the rest of the page updates in real time and saves your preferences immediately.
            </p>
            <div style={{ marginTop: '18px' }}>
              <button type="button" className="settings-danger-btn">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
