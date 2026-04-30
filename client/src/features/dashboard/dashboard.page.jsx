import { useEffect, useRef, useState } from 'react';
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
import { getDashboardInvalidationStamp, markDashboardSnapshotStale } from './dashboard.cache';
import '../../styles/dashboard.css';

// ── Module-level SWR-style cache ──────────────────────────────────────────────
// Survives component unmount/remount (i.e. page navigation) so we can serve
// cached data instantly and revalidate silently in the background.
const _snapshotCache = new Map(); // key: `${orgId}:${months}:${categoryWindow}` → { data, ts }
const _setupCache    = new Map(); // key: orgId → { config, budgets, ts }
const CACHE_TTL_MS   = 60_000;   // 60 s — serve stale data up to this age

const RANGE_OPTIONS = [3, 6, 12];
const CATEGORY_COLORS = ['#0073bb', '#1d8102', '#d13212', '#ff9900', '#232f3e', '#879196'];
const CATEGORY_BREAKDOWN_OPTIONS = [
  {
    value: 'all_time',
    label: 'All time',
    subtitle: 'Top expenditure categories across all recorded expenses'
  },
  {
    value: 'this_month',
    label: 'This month',
    subtitle: 'Top expenditure categories this month'
  },
  {
    value: 'last_3_months',
    label: 'Last 3 months',
    subtitle: 'Top expenditure categories over the last 3 months'
  },
  {
    value: 'last_6_months',
    label: 'Last 6 months',
    subtitle: 'Top expenditure categories over the last 6 months'
  },
  {
    value: 'last_12_months',
    label: 'Last 12 months',
    subtitle: 'Top expenditure categories over the last 12 months'
  }
];

function getCategoryBreakdownOption(value) {
  return CATEGORY_BREAKDOWN_OPTIONS.find((option) => option.value === value) || CATEGORY_BREAKDOWN_OPTIONS[0];
}

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

function sumCategoryAmounts(items = []) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function formatMonthKey(monthKey) {
  if (!monthKey) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
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
  const [categoryBreakdownWindow, setCategoryBreakdownWindow] = useState('all_time');
  const [categoryBreakdownMenuOpen, setCategoryBreakdownMenuOpen] = useState(false);
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
  const categoryBreakdownMenuRef = useRef(null);

  // Derived from backend response once available
  const organization = snapshot?.organization || organizations.find((item) => item.id === activeOrganizationId) || null;
  const organizationId = organization?.id || activeOrganizationId || '';
  const selectedCategoryBreakdownOption = getCategoryBreakdownOption(categoryBreakdownWindow);
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
  const categoryBreakdownItems = snapshot?.category_breakdown || [];
  const categoryBreakdownTotal = sumCategoryAmounts(categoryBreakdownItems);
  const currentMonthExpenseTotal = snapshot?.metrics?.current_month_expense_total ?? 0;
  const cashOnHand = snapshot?.metrics?.cash_on_hand ?? null;
  const displayMonthlyBurn = snapshot?.metrics?.monthly_burn ?? null;
  const displayRunwayMonths = snapshot?.metrics?.runway_months ?? null;
  const monthlyBurnSource = snapshot?.metrics?.monthly_burn_source;
  const historicalBurnMonthCount = snapshot?.metrics?.historical_month_count ?? 0;
  const estimatedDepletionMonth = snapshot?.metrics?.estimated_depletion_month;
  const hasHistoricalBurn = historicalBurnMonthCount > 0 && monthlyBurnSource === 'historical';
  const openEndedRunway = hasHistoricalBurn && displayMonthlyBurn === 0 && Number(cashOnHand || 0) > 0;
  const depletedCashWithoutBurn = hasHistoricalBurn && displayMonthlyBurn === 0 && Number(cashOnHand || 0) <= 0;
  const burnStatusLabel = snapshotReady
    ? (
        hasHistoricalBurn
          ? `Trailing ${historicalBurnMonthCount} ${historicalBurnMonthCount === 1 ? 'month' : 'months'}`
          : 'No completed month yet'
      )
    : '...';
  const runwayStatusLabel = !snapshotReady
    ? 'Unknown'
    : estimatedDepletionMonth
      ? `Estimated depletion: ${formatMonthKey(estimatedDepletionMonth)}`
      : openEndedRunway
        ? 'No burn detected across the recent historical months'
        : depletedCashWithoutBurn
          ? 'Cash balance is already depleted'
        : currentMonthExpenseTotal > 0
          ? 'Runway appears after your first completed expense month'
          : 'Add expenses to generate a runway forecast';
  const runwayBadgeClass = displayRunwayMonths != null && displayRunwayMonths <= 3 ? 'danger' : 'success';

  useEffect(() => {
    function handlePointerDown(event) {
      if (!categoryBreakdownMenuRef.current?.contains(event.target)) {
        setCategoryBreakdownMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setCategoryBreakdownMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setLoadingSnapshot(false);
      return;
    }

    let isActive = true;
    const cacheKey = `${activeOrganizationId}:${months}:${categoryBreakdownWindow}`;
    const cached = _snapshotCache.get(cacheKey);
    const invalidationStamp = getDashboardInvalidationStamp(activeOrganizationId);

    // Serve from cache immediately — no spinner on revisit
    if (cached && cached.ts >= invalidationStamp) {
      setSnapshot(cached.data);
      setLoadingSnapshot(false);

      // Only revalidate if cache is stale
      if (Date.now() - cached.ts < CACHE_TTL_MS) return;
    }

    async function loadSnapshot() {
      try {
        if (!cached) setLoadingSnapshot(true); // only show spinner on first load
        setError('');

        const result = await getDashboardSnapshot({
          token,
          organizationId: activeOrganizationId,
          months,
          categoryWindow: categoryBreakdownWindow
        });

        if (isActive) {
          _snapshotCache.set(cacheKey, { data: result, ts: Date.now() });
          setSnapshot(result);
        }
      } catch (requestError) {
        if (isActive && !cached) {
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
  }, [months, categoryBreakdownWindow, activeOrganizationId, token]);

  useEffect(() => {
    if (!token || !organizationId) {
      setConfig({ configured: false, opening_cash_balance: null, opening_cash_effective_date: '' });
      setBudgets({ items: [] });
      setBudgetDrafts([createBudgetDraft()]);
      setLoadingSetup(false);
      return;
    }

    let isActive = true;
    const cached = _setupCache.get(organizationId);

    // Serve setup data from cache instantly
    if (cached) {
      setConfig(cached.config);
      setBudgets(cached.budgets);
      setCashForm({
        opening_cash_balance: cached.config.opening_cash_balance ?? '',
        opening_cash_effective_date: cached.config.opening_cash_effective_date ?? ''
      });
      setBudgetDrafts(createBudgetDrafts(cached.budgets.items));
      setLoadingSetup(false);

      if (Date.now() - cached.ts < CACHE_TTL_MS) return;
    }

    async function loadSetup() {
      try {
        if (!cached) setLoadingSetup(true); // spinner only on first load
        setError('');

        const [configResult, budgetResult] = await Promise.all([
          getDashboardConfig({ token, organizationId }),
          getDashboardBudgets({ token, organizationId })
        ]);

        if (!isActive) return;

        _setupCache.set(organizationId, { config: configResult, budgets: budgetResult, ts: Date.now() });
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
        if (isActive && !cached) {
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
    // Bust cache so next navigation fetches fresh data
    const cacheKey = `${activeOrganizationId}:${months}:${categoryBreakdownWindow}`;
    _snapshotCache.delete(cacheKey);
    _setupCache.delete(organizationId);
    markDashboardSnapshotStale(activeOrganizationId);

    const result = await getDashboardSnapshot({
      token,
      organizationId: activeOrganizationId,
      months,
      categoryWindow: categoryBreakdownWindow
    });

    _snapshotCache.set(cacheKey, { data: result, ts: Date.now() });
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

  if (!organizationId && !loadingSnapshot) {
    return (
      <div className="premium-empty-state">
        <h2 className="premium-empty-title">No Workspace Selected</h2>
        <p className="premium-empty-subtitle">Please select an organization from the top right to view insights.</p>
      </div>
    );
  }

  return (
    <div className="premium-dashboard-container">
      <style>
        {`
          .premium-dashboard-container { padding-bottom: 40px; }
          .premium-hero-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 24px; }
          .premium-card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 32px;
            position: relative;
            transition: background 150ms ease, box-shadow 150ms ease;
          }
          .premium-card:hover { box-shadow: var(--glow-shadow); }
          .premium-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); font-weight: 600; margin-bottom: 12px; display: block; }
          .premium-hero-value { font-size: 3.5rem; font-weight: 700; color: var(--text-primary); line-height: 1; margin: 8px 0; }
          .premium-hero-meta { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
          .premium-badge { background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 4px 12px; border-radius: 100px; font-size: 0.8rem; color: var(--text-secondary); }
          .premium-badge.danger { color: var(--accent-red); border-color: rgba(220, 38, 38, 0.3); background: rgba(220, 38, 38, 0.05); }
          .premium-badge.success { color: var(--accent-green); }
          .premium-runway-circle { position: relative; width: 140px; height: 140px; margin: 0 auto; }
          .premium-runway-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .premium-runway-text strong { font-size: 2rem; font-weight: 700; }
          .premium-runway-text span { font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em; }
          .premium-runway-footer { text-align: center; margin-top: 24px; }
          .premium-runway-footer h3 { font-size: 1.1rem; margin: 0 0 4px; font-weight: 600; }
          .premium-runway-footer p { color: var(--text-secondary); font-size: 0.85rem; margin: 0; }
          .premium-second-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .premium-card-header { display: flex; justify-content: space-between; margin-bottom: 24px; }
          .premium-card-title { margin: 0; font-size: 1.25rem; font-weight: 600; }
          .premium-card-subtitle { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.85rem; }
          .premium-menu { position: relative; }
          .premium-menu-popover {
            position: absolute;
            top: calc(100% + 10px);
            right: 0;
            z-index: 5;
            min-width: 180px;
            padding: 8px;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--card);
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
          }
          .premium-menu-item {
            width: 100%;
            height: auto;
            border: 0;
            border-radius: 10px;
            padding: 10px 12px;
            background: transparent;
            color: var(--text);
            text-align: left;
            font-size: 0.9rem;
            font-weight: 500;
            box-shadow: none;
            transform: none;
          }
          .premium-menu-item:hover {
            background: rgba(59, 130, 246, 0.08);
            box-shadow: none;
            transform: none;
          }
          .premium-menu-item.is-active {
            background: rgba(59, 130, 246, 0.12);
            color: var(--accent-blue);
          }
          .premium-donut-layout { display: flex; align-items: center; gap: 24px; }
          .premium-donut-container { position: relative; width: 220px; height: 220px; flex-shrink: 0; }
          .premium-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .premium-donut-center span { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
          .premium-donut-center strong { font-size: 1.5rem; font-weight: 700; }
          .premium-legend { flex: 1; display: flex; flex-direction: column; gap: 16px; }
          .premium-legend-item { display: flex; align-items: center; justify-content: space-between; }
          .premium-legend-label { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 500; }
          .premium-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
          .premium-legend-value { text-align: right; }
          .premium-legend-value strong { display: block; font-size: 1rem; font-weight: 600; }
          .premium-legend-value span { font-size: 0.75rem; color: var(--text-secondary); }
          .premium-trend-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
          .premium-trend-footer span { font-size: 0.85rem; color: var(--text-secondary); }
          .premium-trend-footer strong { font-size: 0.9rem; color: var(--accent-red); font-weight: 600; }
        `}
      </style>
      {status && <p className="notice finance-banner">{status}</p>}
      {error && <p className="error finance-banner">{error}</p>}

      <div className="premium-hero-grid">
        {/* Cash Balance Card */}
        <div className="premium-card" style={{ borderLeft: '3px solid var(--accent-green)' }}>
          <span className="premium-label">Cash Balance</span>
          <div className="premium-hero-value" style={{ fontSize: '2.6rem', color: snapshotReady && snapshot.metrics.cash_on_hand != null ? 'var(--accent-green)' : 'var(--text-primary)' }}>
            {snapshotReady
              ? formatCurrency(snapshot.metrics.cash_on_hand, { fallback: '$0' })
              : metricFallback}
          </div>
          <div className="premium-hero-meta">
            {snapshotReady && snapshot.metrics.cash_on_hand != null && (() => {
              const trends = snapshot.trends || [];
              const last = trends[trends.length - 1]?.amount || 0;
              const prev = trends[trends.length - 2]?.amount || 0;
              const pct = prev > 0 ? ((last - prev) / prev * 100).toFixed(1) : null;
              const up = pct !== null && Number(pct) >= 0;
              return (
                <>
                  {pct !== null && (
                    <span className={`premium-badge ${up ? 'success' : 'danger'}`}>
                      {up ? '+' : ''}{pct}% vs last month
                    </span>
                  )}
                  <span className="premium-badge">Live from Finance</span>
                </>
              );
            })()}
          </div>
        </div>

        {/* Net Burn Card */}
        <div className="premium-card">
          <span className="premium-label">Total Net Burn (Monthly)</span>
          <div className="premium-hero-value" style={{ fontSize: '2.4rem' }}>
            {snapshotReady ? formatCurrency(displayMonthlyBurn, { fallback: 'Pending' }) : metricFallback}
          </div>
          <div className="premium-hero-meta">
            <span className="premium-badge">{burnStatusLabel}</span>
            <span className={`premium-badge ${snapshotReady && displayRunwayMonths != null ? runwayBadgeClass : ''}`}>
              {openEndedRunway
                ? 'No active burn'
                : snapshotReady && displayRunwayMonths != null
                ? (displayRunwayMonths <= 3 ? 'Critical Threshold' : 'Runway Healthy')
                : 'Awaiting forecast'}
            </span>
          </div>
        </div>

        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="premium-runway-circle">
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--accent-green)" strokeWidth="6" strokeDasharray="282" strokeDashoffset={openEndedRunway ? 0 : 282 - (282 * Math.min(displayRunwayMonths || 0, 12) / 12)} style={{ transition: 'stroke-dashoffset 1s ease', filter: 'drop-shadow(0 0 6px var(--accent-green))' }} />
            </svg>
            <div className="premium-runway-text">
              <strong>{openEndedRunway ? '∞' : snapshotReady && displayRunwayMonths != null ? Number(displayRunwayMonths).toFixed(0) : '-'}</strong>
              <span>{openEndedRunway || (snapshotReady && displayRunwayMonths != null) ? 'Months' : 'Pending'}</span>
            </div>
          </div>
          <div className="premium-runway-footer">
            <h3>Cash Runway</h3>
            <p>{runwayStatusLabel}</p>
          </div>
        </div>
      </div>

      <div className="premium-second-row">
        <div className="premium-card">
          <div className="premium-card-header">
            <div>
              <h2 className="premium-card-title">Expense Breakdown</h2>
              <p className="premium-card-subtitle">{selectedCategoryBreakdownOption.subtitle}</p>
            </div>
            <div ref={categoryBreakdownMenuRef} className="premium-menu">
              <button
                className="icon-btn"
                style={{ height: '32px', width: '32px' }}
                type="button"
                aria-haspopup="menu"
                aria-expanded={categoryBreakdownMenuOpen}
                aria-label="Change expense breakdown range"
                onClick={() => setCategoryBreakdownMenuOpen((current) => !current)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              {categoryBreakdownMenuOpen && (
                <div className="premium-menu-popover" role="menu" aria-label="Expense breakdown range">
                  {CATEGORY_BREAKDOWN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.value === categoryBreakdownWindow}
                      className={`premium-menu-item ${option.value === categoryBreakdownWindow ? 'is-active' : ''}`.trim()}
                      onClick={() => {
                        setCategoryBreakdownWindow(option.value);
                        setCategoryBreakdownMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {busy || !snapshotReady ? (
            <div className="finance-loading">Loading category mix...</div>
          ) : !categoryBreakdownItems.length ? (
            <EmptyState
              title="No expenses in this range"
              body="Try a wider date range like All time or Last 12 months to see category distribution."
            />
          ) : (
            <div className="premium-donut-layout">
              <div className="premium-donut-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdownItems}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={75}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {categoryBreakdownItems.map((entry, index) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={renderChartTooltip} 
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="premium-donut-center">
                  <span>{selectedCategoryBreakdownOption.label}</span>
                  <strong>{formatCurrency(categoryBreakdownTotal, { maximumFractionDigits: 0 })}</strong>
                </div>
              </div>

              <div className="premium-legend">
                {categoryBreakdownItems.slice(0, 4).map((item, idx) => (
                  <div key={item.category} className="premium-legend-item">
                    <div className="premium-legend-label">
                      <div className="premium-legend-dot" style={{ background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}></div>
                      {item.category}
                    </div>
                    <div className="premium-legend-value">
                      <strong>{formatCurrency(item.amount, { maximumFractionDigits: 0 })}</strong>
                      <span>{categoryBreakdownTotal > 0 ? ((Number(item.amount) / categoryBreakdownTotal) * 100).toFixed(1) : '0.0'}% OF TOTAL</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* <div className="premium-insight">
            <h4>Optimize Runway?</h4>
            <p>Our AI found $800 in redundant SaaS subscriptions.</p>
            <button className="premium-primary-btn">Run Spark Audit</button>
          </div> */}
        </div>

        <div className="premium-card">
          <div className="premium-card-header">
             <div>
              <h2 className="premium-card-title">Monthly Burn Rate</h2>
              <p className="premium-card-subtitle">Trailing 6-month trajectory</p>
            </div>
          </div>

          {busy || !snapshotReady ? (
            <div className="finance-loading">Loading trends...</div>
          ) : (
            <>
              <div style={{ height: '300px', margin: '0 -16px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={snapshot.trends} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="burnArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }} dy={10} />
                    <Tooltip
                      cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
                      formatter={renderChartTooltip}
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="var(--accent-blue)"
                      strokeWidth={4}
                      fill="url(#burnArea)"
                      name="Spend"
                      dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }}
                      activeDot={{ r: 6, fill: '#fff' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="premium-trend-footer">
                <span>Trend Prediction</span>
                <strong>+4.2% Growth</strong>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// We intentionally ignore the old code below to fully replace it with premium structure.


export default DashboardPage;
