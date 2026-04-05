import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  getDashboardBudgets,
  getDashboardConfig,
  getDashboardSnapshot,
  getOrganizationTeam,
  regenerateOrganizationJoinCode,
  updateDashboardBudgets,
  updateDashboardConfig
} from './dashboard.api';
import '../../styles/dashboard.css';

const RANGE_OPTIONS = [3, 6, 12];
const CATEGORY_COLORS = ['#0073bb', '#1d8102', '#d13212', '#ff9900', '#232f3e', '#879196'];

function createBudgetDraft(item = {}) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    category: item.category || '',
    monthly_limit: item.monthly_limit === undefined || item.monthly_limit === null ? '' : String(item.monthly_limit)
  };
}

function createBudgetDrafts(items) {
  return items.length ? items.map((item) => createBudgetDraft(item)) : [createBudgetDraft()];
}

function formatCurrency(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return options.fallback || 'Not configured';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  }).format(Number(value));
}

function formatRunway(value) {
  if (value === null || value === undefined) {
    return 'Not configured';
  }

  return `${Number(value).toFixed(1)} mo`;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return 'New spend pattern';
  }

  return `${Number(value).toFixed(1)}%`;
}

function formatShortDate(value) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function formatMonthLabel(value) {
  return value.replace(' months', 'M');
}

function renderChartTooltip(value, name) {
  return [formatCurrency(value, { maximumFractionDigits: 0 }), name];
}

function MetricCard({ label, value, helper }) {
  return (
    <article className="finance-metric-card">
      <span className="finance-metric-label">{label}</span>
      <strong className="finance-metric-value">{value}</strong>
      <span className="finance-metric-helper">{helper}</span>
    </article>
  );
}

function Panel({ actions, children, className = '', subtitle, title }) {
  return (
    <section className={`finance-panel ${className}`.trim()}>
      <div className="finance-panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="finance-empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function OrganizationSwitcher({ onSelectOrganization, organizationId, organizations }) {
  if (!organizations.length) {
    return null;
  }

  return (
    <label className="finance-org-switcher">
      <span className="field-label">Workspace</span>
      <select value={organizationId} onChange={(event) => onSelectOrganization(event.target.value)}>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name} · {organization.role}
          </option>
        ))}
      </select>
    </label>
  );
}

function DashboardPage({
  activeOrganizationId,
  onLogout,
  onOpenIntegrations,
  onSelectOrganization,
  status,
  token,
  user
}) {
  const organizations = user?.organizations || [];

  const [months, setMonths] = useState(6);
  const [snapshot, setSnapshot] = useState(null);
  const [config, setConfig] = useState({
    configured: false,
    opening_cash_balance: null,
    opening_cash_effective_date: ''
  });
  const [budgets, setBudgets] = useState({ items: [] });
  const [team, setTeam] = useState(null);
  const [cashForm, setCashForm] = useState({
    opening_cash_balance: '',
    opening_cash_effective_date: ''
  });
  const [budgetDrafts, setBudgetDrafts] = useState([createBudgetDraft()]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [error, setError] = useState('');
  const [teamError, setTeamError] = useState('');
  const [cashMessage, setCashMessage] = useState('');
  const [budgetMessage, setBudgetMessage] = useState('');
  const [teamMessage, setTeamMessage] = useState('');
  const [savingCash, setSavingCash] = useState(false);
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [regeneratingJoinCode, setRegeneratingJoinCode] = useState(false);

  // Derived from backend response once available
  const organization = snapshot?.organization || organizations.find((item) => item.id === activeOrganizationId) || null;
  const organizationId = organization?.id || activeOrganizationId || '';
  const permissions = organization?.permissions || {
    can_manage_finance: ['founder', 'admin'].includes(organization?.role || ''),
    is_founder: organization?.role === 'founder'
  };
  const { can_manage_finance: canManageFinance, is_founder: isFounder } = permissions;

  const dashboardState = loadingSnapshot ? 'loading' : snapshot?.dashboard_state || 'unavailable';
  const snapshotReady = dashboardState === 'ready' || dashboardState === 'no_history';
  const busy = loadingSnapshot || loadingSetup;
  const noTransactionHistory = dashboardState === 'no_history';
  const unavailable = dashboardState === 'unavailable';
  const budgetsConfigured = snapshot?.config.budgets_configured ?? budgets.items.length > 0;
  const metricFallback = busy ? 'Loading...' : 'Unavailable';

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setLoadingSnapshot(false);
      return;
    }

    let isActive = true;

    async function loadSnapshot() {
      try {
        setLoadingSnapshot(true);
        setError('');

        const result = await getDashboardSnapshot({
          token,
          organizationId: activeOrganizationId,
          months
        });

        if (isActive) {
          setSnapshot(result);
        }
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message);
        }
      } finally {
        if (isActive) {
          setLoadingSnapshot(false);
        }
      }
    }

    loadSnapshot();

    return () => {
      isActive = false;
    };
  }, [months, activeOrganizationId, token]);

  useEffect(() => {
    if (!token || !organizationId) {
      setConfig({
        configured: false,
        opening_cash_balance: null,
        opening_cash_effective_date: ''
      });
      setBudgets({ items: [] });
      setBudgetDrafts([createBudgetDraft()]);
      setLoadingSetup(false);
      return;
    }

    let isActive = true;

    async function loadSetup() {
      try {
        setLoadingSetup(true);
        setError('');

        const [configResult, budgetResult] = await Promise.all([
          getDashboardConfig({ token, organizationId }),
          getDashboardBudgets({ token, organizationId })
        ]);

        if (!isActive) {
          return;
        }

        setConfig(configResult);
        setCashForm({
          opening_cash_balance:
            configResult.opening_cash_balance === null || configResult.opening_cash_balance === undefined
              ? ''
              : String(configResult.opening_cash_balance),
          opening_cash_effective_date: configResult.opening_cash_effective_date || ''
        });
        setBudgets(budgetResult);
        setBudgetDrafts(createBudgetDrafts(budgetResult.items || []));
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message);
        }
      } finally {
        if (isActive) {
          setLoadingSetup(false);
        }
      }
    }

    loadSetup();

    return () => {
      isActive = false;
    };
  }, [organizationId, token]);

  useEffect(() => {
    if (!token || !organizationId || !isFounder) {
      setTeam(null);
      setTeamError('');
      setTeamMessage('');
      setLoadingTeam(false);
      return;
    }

    let isActive = true;

    async function loadTeam() {
      try {
        setLoadingTeam(true);
        setTeamError('');

        const result = await getOrganizationTeam({
          token,
          organizationId
        });

        if (isActive) {
          setTeam(result);
        }
      } catch (requestError) {
        if (isActive) {
          setTeamError(requestError.message);
        }
      } finally {
        if (isActive) {
          setLoadingTeam(false);
        }
      }
    }

    loadTeam();

    return () => {
      isActive = false;
    };
  }, [isFounder, organizationId, token]);

  async function refreshSnapshot() {
    const result = await getDashboardSnapshot({
      token,
      organizationId: activeOrganizationId,
      months
    });

    setSnapshot(result);
  }

  async function handleSaveCashConfig(event) {
    event.preventDefault();

    if (!canManageFinance) {
      return;
    }

    try {
      setSavingCash(true);
      setCashMessage('');
      setError('');

      const result = await updateDashboardConfig({
        token,
        organizationId,
        payload: {
          opening_cash_balance: cashForm.opening_cash_balance,
          opening_cash_effective_date: cashForm.opening_cash_effective_date
        }
      });

      setConfig(result);
      setCashForm({
        opening_cash_balance:
          result.opening_cash_balance === null || result.opening_cash_balance === undefined
            ? ''
            : String(result.opening_cash_balance),
        opening_cash_effective_date: result.opening_cash_effective_date || ''
      });
      setCashMessage('Opening cash settings saved.');
      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingCash(false);
    }
  }

  async function handleSaveBudgets(event) {
    event.preventDefault();

    if (!canManageFinance) {
      return;
    }

    try {
      setSavingBudgets(true);
      setBudgetMessage('');
      setError('');

      const payload = {
        items: budgetDrafts
          .map((item) => ({
            category: item.category.trim(),
            monthly_limit: item.monthly_limit
          }))
          .filter((item) => item.category || item.monthly_limit)
      };

      const result = await updateDashboardBudgets({
        token,
        organizationId,
        payload
      });

      setBudgets(result);
      setBudgetDrafts(createBudgetDrafts(result.items || []));
      setBudgetMessage(result.items.length ? 'Budgets saved.' : 'Budgets cleared.');
      await refreshSnapshot();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingBudgets(false);
    }
  }

  async function handleRegenerateJoinCode() {
    if (!isFounder) {
      return;
    }

    try {
      setRegeneratingJoinCode(true);
      setTeamMessage('');
      setTeamError('');

      const result = await regenerateOrganizationJoinCode({
        token,
        organizationId
      });

      setTeam((current) => (
        current
          ? {
              ...current,
              organization: result.organization
            }
          : {
              organization: result.organization,
              members: []
            }
      ));
      setTeamMessage('Telegram join link regenerated.');
    } catch (requestError) {
      setTeamError(requestError.message);
    } finally {
      setRegeneratingJoinCode(false);
    }
  }

  async function handleCopyJoinLink() {
    if (!team?.organization) {
      return;
    }

    try {
      const valueToCopy = team.organization.join_link || team.organization.join_code;

      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard is not available in this browser');
      }

      await navigator.clipboard.writeText(valueToCopy);
      setTeamMessage(team.organization.join_link ? 'Telegram join link copied.' : 'Join code copied.');
    } catch (requestError) {
      setTeamError(requestError.message);
    }
  }

  function handleBudgetDraftChange(id, field, value) {
    setBudgetDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function handleAddBudgetRow() {
    setBudgetDrafts((current) => [...current, createBudgetDraft()]);
  }

  function handleRemoveBudgetRow(id) {
    setBudgetDrafts((current) => {
      if (current.length === 1) {
        return [createBudgetDraft()];
      }

      return current.filter((item) => item.id !== id);
    });
  }

  if (!organizationId && !loadingSnapshot) {
    return (
      <div className="card">
        <p className="eyebrow">SPARK Console</p>
        <h1>Dashboard</h1>
        <p className="card-subtitle">This account does not have an organization selected yet.</p>
      </div>
    );
  }

  return (
    <div className="finance-dashboard-wrapper">
      <nav className="finance-navbar">
        <div className="finance-navbar-brand">
          <span className="finance-navbar-logo">SPARK</span>
          <div className="finance-navbar-divider"></div>
          <span className="finance-navbar-title">Founder Dashboard</span>
        </div>

        <div className="finance-navbar-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="Search" />
          <span className="finance-navbar-shortcut">[Alt+S]</span>
        </div>
        <div className="finance-header-actions">
          <OrganizationSwitcher
            onSelectOrganization={onSelectOrganization}
            organizationId={organizationId}
            organizations={organizations}
          />
          <div className="finance-org-pill">
            <span>Role</span>
            <strong>{organization?.role || 'member'}</strong>
          </div>
          <button type="button" className="secondary-btn finance-mini-btn" onClick={onOpenIntegrations}>
            Integrations
          </button>
          <button type="button" className="secondary-btn finance-mini-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="finance-dashboard-shell">
        <header className="finance-dashboard-header">
          <div>
            <h1>Overview</h1>
            <p className="finance-dashboard-subtitle">
              Burn, runway, revenue, vendor concentration, and budget pressure for{' '}
              <strong>{organization?.name || organizationId}</strong>.
            </p>
          </div>
        </header>

      {status && <p className="notice finance-banner">{status}</p>}
      {error && <p className="error finance-banner">{error}</p>}

      <div className="finance-toolbar">
        <div className="finance-range-toggle" role="tablist" aria-label="Dashboard range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === months ? 'finance-range-button is-active' : 'finance-range-button'}
              onClick={() => setMonths(option)}
            >
              {formatMonthLabel(`${option} months`)}
            </button>
          ))}
        </div>
        {!canManageFinance && (
          <p className="finance-inline-note">Founders and admins can edit cash settings and budgets.</p>
        )}
      </div>

      <section className="finance-metrics-grid">
        <MetricCard
          label="Cash On Hand"
          value={snapshotReady ? formatCurrency(snapshot.metrics.cash_on_hand) : metricFallback}
          helper={config.configured ? 'Opening cash plus net flow since setup date' : 'Set opening cash to calculate'}
        />
        <MetricCard
          label="Runway"
          value={snapshotReady ? formatRunway(snapshot.metrics.runway_months) : metricFallback}
          helper="Cash on hand divided by the trailing burn baseline"
        />
        <MetricCard
          label="Monthly Burn"
          value={snapshotReady ? formatCurrency(snapshot.metrics.monthly_burn) : metricFallback}
          helper="Average outflow across the last 3 complete months"
        />
        <MetricCard
          label="Revenue This Month"
          value={snapshotReady ? formatCurrency(snapshot.metrics.monthly_revenue) : metricFallback}
          helper="Income recorded in the current calendar month"
        />
      </section>

      <section className="finance-dashboard-grid">
        <Panel title="Expense Trend" subtitle={`Outflow across the last ${months} months`}>
          {busy ? (
            <div className="finance-loading">Loading dashboard data…</div>
          ) : unavailable ? (
            <EmptyState
              title="Dashboard unavailable"
              body="The dashboard data could not be loaded right now. Try refreshing after the API is back."
            />
          ) : noTransactionHistory ? (
            <EmptyState
              title="No transactions yet"
              body="As transactions land from ingestion or manual updates, the burn chart will populate here."
            />
          ) : (
            <div className="finance-chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={snapshot.trends}>
                  <defs>
                    <linearGradient id="sparkTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0073bb" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0073bb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eaeded" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#545b64', fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#545b64', fontSize: 12 }}
                    tickFormatter={(value) => formatCurrency(value, { maximumFractionDigits: 0 })}
                  />
                  <Tooltip
                    cursor={{ stroke: '#0073bb', strokeWidth: 1, strokeDasharray: '4 4' }}
                    formatter={renderChartTooltip}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #d5dbdb',
                      borderRadius: 4,
                      color: '#16191f'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#0073bb"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#sparkTrend)"
                    name="Outflow"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Category Breakdown" subtitle="Current-month spend by category">
          {busy ? (
            <div className="finance-loading">Loading category mix…</div>
          ) : unavailable ? (
            <EmptyState
              title="Dashboard unavailable"
              body="The category breakdown will appear here once dashboard data loads successfully."
            />
          ) : snapshot.category_breakdown.length === 0 ? (
            <EmptyState
              title="No spend this month"
              body="When current-month expenses or salary entries appear, category concentration will show up here."
            />
          ) : (
            <div className="finance-breakdown-layout">
              <div className="finance-chart-shell">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={snapshot.category_breakdown}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={64}
                      outerRadius={94}
                      paddingAngle={3}
                    >
                      {snapshot.category_breakdown.map((entry, index) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={renderChartTooltip}
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #d5dbdb',
                        borderRadius: 4,
                        color: '#16191f'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="finance-list">
                {snapshot.category_breakdown.map((item) => (
                  <div key={item.category} className="finance-list-row">
                    <div>
                      <strong>{item.category}</strong>
                    </div>
                    <span>{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Top Vendors" subtitle={`Highest outflow over the last ${months} months`}>
          {busy ? (
            <div className="finance-loading">Loading vendors…</div>
          ) : unavailable ? (
            <EmptyState
              title="Dashboard unavailable"
              body="The vendor ranking needs a successful dashboard response before it can render."
            />
          ) : snapshot.top_vendors.length === 0 ? (
            <EmptyState
              title="No vendor concentration yet"
              body="This list appears once outflow transactions start accumulating for the selected range."
            />
          ) : (
            <div className="finance-chart-shell finance-chart-shell-compact">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={snapshot.top_vendors} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="#eaeded" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#545b64', fontSize: 12 }}
                    tickFormatter={(value) => formatCurrency(value, { maximumFractionDigits: 0 })}
                  />
                  <YAxis
                    type="category"
                    width={104}
                    dataKey="vendor"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#16191f', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={renderChartTooltip}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #d5dbdb',
                      borderRadius: 4,
                      color: '#16191f'
                    }}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} fill="#0073bb" name="Spend" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Budget Alerts"
          subtitle={
            budgetsConfigured
              ? 'Current-month categories nearing or exceeding budget'
              : 'Set budgets to start alerting on overspend'
          }
        >
          {busy ? (
            <div className="finance-loading">Loading budget alerts…</div>
          ) : unavailable ? (
            <EmptyState
              title="Dashboard unavailable"
              body="Budget alerts will return once the dashboard API is reachable again."
            />
          ) : !budgetsConfigured ? (
            <EmptyState
              title="No budgets configured"
              body="Add category budgets below to turn this panel into a live overspend monitor."
            />
          ) : snapshot.budget_alerts.length === 0 ? (
            <EmptyState
              title="Budget health looks clear"
              body="No tracked category has crossed the 80% threshold yet this month."
            />
          ) : (
            <div className="finance-alert-stack">
              {snapshot.budget_alerts.map((alert) => (
                <article key={alert.category} className={`finance-alert-card is-${alert.status}`}>
                  <div>
                    <strong>{alert.category}</strong>
                    <p>
                      {formatCurrency(alert.current_spend)} of {formatCurrency(alert.monthly_limit)} used
                    </p>
                  </div>
                  <div className="finance-alert-meta">
                    <span>{alert.status === 'exceeded' ? 'Exceeded' : 'Warning'}</span>
                    <strong>{alert.percent_used}%</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Expense Spikes"
          subtitle="Current-month categories running far above the prior 3-month baseline"
        >
          {busy ? (
            <div className="finance-loading">Loading spike detection…</div>
          ) : unavailable ? (
            <EmptyState
              title="Dashboard unavailable"
              body="Spike detection could not be evaluated because the dashboard data failed to load."
            />
          ) : !snapshot.config.history_ready_for_spikes ? (
            <EmptyState
              title="More history needed"
              body="Spike detection turns on after three complete months of transaction history are available."
            />
          ) : snapshot.spike_alerts.length === 0 ? (
            <EmptyState
              title="No unusual spikes detected"
              body="Current-month spend is still within the expected range for tracked categories."
            />
          ) : (
            <div className="finance-alert-stack">
              {snapshot.spike_alerts.map((alert) => (
                <article key={alert.category} className="finance-alert-card is-spike">
                  <div>
                    <strong>{alert.category}</strong>
                    <p>
                      {formatCurrency(alert.current_spend)} vs {formatCurrency(alert.average_spend)} average
                    </p>
                  </div>
                  <div className="finance-alert-meta">
                    <span>Delta {formatCurrency(alert.delta)}</span>
                    <strong>{formatPercent(alert.increase_percent)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>

        {isFounder && (
          <Panel
            className="finance-panel-full"
            title="Team Access"
            subtitle="Share the Telegram join link with teammates and monitor who already has organization access"
            actions={
              <button
                type="button"
                className="secondary-btn finance-mini-button"
                onClick={handleRegenerateJoinCode}
                disabled={loadingTeam || regeneratingJoinCode}
              >
                {regeneratingJoinCode ? 'Regenerating…' : 'Regenerate Link'}
              </button>
            }
          >
            {loadingTeam ? (
              <div className="finance-loading">Loading team access…</div>
            ) : teamError ? (
              <p className="error finance-form-notice">{teamError}</p>
            ) : !team ? (
              <EmptyState
                title="Team details unavailable"
                body="Founder access details could not be loaded for this organization."
              />
            ) : (
              <div className="finance-team-layout">
                <div className="finance-join-link-card">
                  <span className="finance-metric-label">Join Code</span>
                  <strong className="finance-join-code">{team.organization.join_code}</strong>
                  <span className="finance-metric-label">Telegram Deep Link</span>
                  <code className="finance-join-link-value">
                    {team.organization.join_link || 'Set TELEGRAM_BOT_USERNAME to generate the full link.'}
                  </code>
                  <p className="finance-inline-note">
                    Members use this link inside Telegram, link their SPARK account if needed, and then the bot can ingest
                    images or text on behalf of the joined organization.
                  </p>
                  <div className="finance-inline-actions">
                    <button
                      type="button"
                      className="secondary-btn finance-mini-button"
                      onClick={handleCopyJoinLink}
                      disabled={!team.organization.join_code}
                    >
                      Copy {team.organization.join_link ? 'Link' : 'Code'}
                    </button>
                  </div>
                  {teamMessage && <p className="notice finance-form-notice">{teamMessage}</p>}
                </div>
                <div className="finance-member-list">
                  <div className="finance-member-list-head">
                    <span>Member</span>
                    <span>Role</span>
                    <span>Joined</span>
                  </div>
                  {team.members.map((member) => (
                    <div key={member.user_id} className="finance-member-row">
                      <div>
                        <strong>{member.email || 'No email on file'}</strong>
                        <p>{member.telegram_id ? `Telegram ${member.telegram_id}` : 'Telegram not linked yet'}</p>
                      </div>
                      <span>{member.role}</span>
                      <span>{formatShortDate(member.joined_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}

        <Panel title="Cash Setup" subtitle="Define the opening balance that anchors cash-on-hand and runway">
          <form className="finance-form" onSubmit={handleSaveCashConfig}>
            <div className="field">
              <label className="field-label" htmlFor="openingCashBalance">
                Opening Cash Balance
              </label>
              <input
                id="openingCashBalance"
                type="number"
                min="0"
                step="0.01"
                value={cashForm.opening_cash_balance}
                onChange={(event) =>
                  setCashForm((current) => ({ ...current, opening_cash_balance: event.target.value }))
                }
                placeholder="250000"
                disabled={!canManageFinance || savingCash}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="openingCashDate">
                Effective Date
              </label>
              <input
                id="openingCashDate"
                type="date"
                value={cashForm.opening_cash_effective_date}
                onChange={(event) =>
                  setCashForm((current) => ({ ...current, opening_cash_effective_date: event.target.value }))
                }
                disabled={!canManageFinance || savingCash}
              />
            </div>
            <div className="finance-form-footer">
              <p className="finance-inline-note">
                {config.configured
                  ? `Current anchor: ${formatCurrency(config.opening_cash_balance)} from ${config.opening_cash_effective_date}`
                  : 'No opening cash anchor has been saved yet.'}
              </p>
              <button type="submit" disabled={!canManageFinance || savingCash}>
                {savingCash ? 'Saving…' : 'Save Cash Setup'}
              </button>
            </div>
            {cashMessage && <p className="notice finance-form-notice">{cashMessage}</p>}
          </form>
        </Panel>

        <Panel
          title="Category Budgets"
          subtitle="Monthly category caps that drive the budget alert system"
          actions={
            <button
              type="button"
              className="secondary-btn finance-mini-button"
              onClick={handleAddBudgetRow}
              disabled={!canManageFinance}
            >
              Add Row
            </button>
          }
        >
          <form className="finance-form" onSubmit={handleSaveBudgets}>
            <div className="finance-budget-table">
              <div className="finance-budget-table-head">
                <span>Category</span>
                <span>Monthly Limit</span>
                <span>Actions</span>
              </div>
              {budgetDrafts.map((item) => (
                <div key={item.id} className="finance-budget-row">
                  <input
                    type="text"
                    value={item.category}
                    onChange={(event) => handleBudgetDraftChange(item.id, 'category', event.target.value)}
                    placeholder="Software"
                    disabled={!canManageFinance || savingBudgets}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.monthly_limit}
                    onChange={(event) => handleBudgetDraftChange(item.id, 'monthly_limit', event.target.value)}
                    placeholder="12000"
                    disabled={!canManageFinance || savingBudgets}
                  />
                  <button
                    type="button"
                    className="secondary-btn finance-mini-button"
                    onClick={() => handleRemoveBudgetRow(item.id)}
                    disabled={!canManageFinance || savingBudgets}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="finance-form-footer">
              <p className="finance-inline-note">
                Alerts fire at 80% usage and flip to exceeded once spend crosses 100% of the budget.
              </p>
              <button type="submit" disabled={!canManageFinance || savingBudgets}>
                {savingBudgets ? 'Saving…' : 'Save Budgets'}
              </button>
            </div>
            {budgetMessage && <p className="notice finance-form-notice">{budgetMessage}</p>}
          </form>
        </Panel>
      </section>
    </div>
    </div>
  );
}

export default DashboardPage;
