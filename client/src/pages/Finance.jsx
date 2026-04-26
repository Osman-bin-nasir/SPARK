import { useState, useEffect, useCallback } from 'react';
import { post, get } from '../services/http';
import { endpoints } from '../services/endpoints';
import { markDashboardSnapshotStale } from '../features/dashboard/dashboard.cache';

const INCOME_CATEGORIES = ['funding', 'revenue', 'grant', 'loan', 'other_income'];
const EXPENSE_CATEGORIES = ['software', 'cloud', 'payroll', 'marketing', 'office', 'travel', 'legal', 'hardware', 'other'];

const TYPE_META = {
  income: { label: 'Income / Funding', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' },
  expense: { label: 'Expense', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
  salary: { label: 'Salary / Payroll', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)' },
};

function formatCurrency(val) {
  if (val == null || Number.isNaN(Number(val))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(val));
}

function formatSignedCurrency(val) {
  if (val == null || Number.isNaN(Number(val))) return '—';
  const amount = Number(val);

  if (amount === 0) {
    return '$0';
  }

  return `${amount > 0 ? '+' : '−'}${formatCurrency(Math.abs(amount))}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const EMPTY_FORM = {
  transaction_type: 'income',
  amount: '',
  vendor: '',
  category: 'funding',
  transaction_date: new Date().toISOString().slice(0, 10),
  notes: '',
};

function getOrganizationPreferenceKey(userId) {
  return userId ? `spark.active-organization.${userId}` : '';
}

function resolveActiveOrganizationId(user) {
  const organizations = Array.isArray(user?.organizations) ? user.organizations : [];

  if (!organizations.length) {
    return '';
  }

  const preferredOrganizationId = localStorage.getItem(getOrganizationPreferenceKey(user?.id)) || '';

  if (preferredOrganizationId && organizations.some((item) => item.id === preferredOrganizationId)) {
    return preferredOrganizationId;
  }

  if (user?.default_organization_id && organizations.some((item) => item.id === user.default_organization_id)) {
    return user.default_organization_id;
  }

  return organizations[0]?.id || '';
}

function normalizeFinanceTransactionItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.transaction_id || item.id || `tx-${index}`,
    vendor: item.vendor || 'Unknown Vendor',
    category: item.category || 'Uncategorized',
    transaction_date: item.transaction_date || null,
    amount: Number(item.amount || 0),
    similarity_score: Number.isFinite(Number(item.similarity_score)) ? Number(item.similarity_score) : null,
    transaction_type: item.transaction_type || null
  }));
}

function sumTransactionAmounts(items) {
  return normalizeFinanceTransactionItems(items).reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getFinanceBreakdownRows(response) {
  const rows = response?.summary?.breakdown || response?.current?.breakdown || [];

  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: `${row.group_value || 'group'}-${index}`,
    label: row.group_value || 'Uncategorized',
    transaction_count: Number(row.transaction_count || 0),
    total_amount: Number(row.total_amount || 0),
    average_amount: Number(row.average_amount || 0)
  }));
}

function getFinanceResultTransactions(response) {
  const resultItems = normalizeFinanceTransactionItems(response?.items);

  if (resultItems.length > 0) {
    return resultItems;
  }

  const citationItems = normalizeFinanceTransactionItems(response?.citations);

  if (citationItems.length > 0) {
    return citationItems;
  }

  const summaryItems = normalizeFinanceTransactionItems(response?.summary?.sample_transactions);

  if (summaryItems.length > 0) {
    return summaryItems;
  }

  const currentItems = normalizeFinanceTransactionItems(response?.current?.sample_transactions);

  if (currentItems.length > 0) {
    return currentItems;
  }

  return normalizeFinanceTransactionItems(response?.search?.items);
}

function getFinanceMatchCount(response) {
  const directCount = response?.retrieval?.total;
  const summaryCount = response?.summary?.totals?.transaction_count;
  const currentCount = response?.current?.totals?.transaction_count;
  const searchCount = response?.search?.total;
  const citationCount = Array.isArray(response?.citations) ? response.citations.length : null;

  if (directCount != null) {
    return Number(directCount || 0);
  }

  if (summaryCount != null) {
    return Number(summaryCount || 0);
  }

  if (currentCount != null) {
    return Number(currentCount || 0);
  }

  if (searchCount != null) {
    return Number(searchCount || 0);
  }

  if (citationCount != null) {
    return Number(citationCount || 0);
  }

  return 0;
}

function getFinanceTotalAmount(response) {
  const directItems = response?.items;
  const summaryTotal = response?.summary?.totals?.total_amount;
  const currentTotal = response?.current?.totals?.total_amount;

  if (summaryTotal != null) {
    return Number(summaryTotal || 0);
  }

  if (currentTotal != null) {
    return Number(currentTotal || 0);
  }

  if (Array.isArray(directItems)) {
    return sumTransactionAmounts(directItems);
  }

  return sumTransactionAmounts(response?.search?.items || response?.citations);
}

function getFinanceAverageAmount(response, totalAmount, matchCount) {
  const summaryAverage = response?.summary?.totals?.average_amount;
  const currentAverage = response?.current?.totals?.average_amount;

  if (summaryAverage != null) {
    return Number(summaryAverage || 0);
  }

  if (currentAverage != null) {
    return Number(currentAverage || 0);
  }

  return matchCount > 0 ? totalAmount / matchCount : null;
}

function buildFinanceSearchResult(response, originalQuestion) {
  const matchCount = getFinanceMatchCount(response);
  const totalAmount = getFinanceTotalAmount(response);
  const averageAmount = getFinanceAverageAmount(response, totalAmount, matchCount);
  const breakdown = getFinanceBreakdownRows(response);
  const transactions = getFinanceResultTransactions(response);

  return {
    answer: typeof response?.answer === 'string' && response.answer.trim()
      ? response.answer.trim()
      : (matchCount > 0 ? 'Transactions found for this query.' : 'No matching transactions were found for this query.'),
    original_question: originalQuestion,
    query: response?.query || response?.plan?.search_query || originalQuestion,
    mode: response?.mode || response?.retrieval?.mode || 'lookup',
    intent: response?.intent || response?.plan?.intent || null,
    plan: response?.plan || null,
    matchCount,
    totalAmount,
    averageAmount,
    delta: response?.delta == null ? null : Number(response.delta),
    percentageChange: response?.percentage_change == null ? null : Number(response.percentage_change),
    comparisonLabel: response?.comparison_label || response?.trend_label || response?.plan?.comparison?.label || response?.plan?.time_label || null,
    breakdown,
    transactions
  };
}

function buildFinanceStatCards(result) {
  const countLabel = ['lookup', 'rag', 'rag_deterministic'].includes(result.mode) ? 'Matches' : 'Transactions';

  if (result.mode === 'comparison' || result.mode === 'trend') {
    return [
      { label: countLabel, value: String(result.matchCount) },
      { label: 'Current Total', value: formatCurrency(result.totalAmount) },
      { label: 'Delta', value: formatSignedCurrency(result.delta) }
    ];
  }

  return [
    { label: countLabel, value: String(result.matchCount) },
    { label: 'Total Amount', value: formatCurrency(result.totalAmount) },
    { label: 'Average', value: result.averageAmount == null ? '—' : formatCurrency(result.averageAmount) }
  ];
}

export default function FinancePage({ activeOrganizationId, token: tokenProp, user: userProp }) {
  const token = tokenProp || localStorage.getItem('token') || '';
  const user = userProp || JSON.parse(localStorage.getItem('user') || 'null');
  const organizationId = activeOrganizationId || resolveActiveOrganizationId(user);
  const authHeaders = { token, headers: organizationId ? { 'X-Organization-Id': organizationId } : {} };

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Totals
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [financeQuestion, setFinanceQuestion] = useState('');
  const [financeSearchResult, setFinanceSearchResult] = useState(null);
  const [financeSearchLoading, setFinanceSearchLoading] = useState(false);
  const [financeSearchError, setFinanceSearchError] = useState('');

  const fetchRecent = useCallback(async () => {
    if (!token || !organizationId) { setLoadingRecent(false); return; }
    try {
      setLoadingRecent(true);
      const result = await get(`${endpoints.transactions}?page_size=8`, authHeaders);
      setRecent(result.items || []);
      // compute quick totals from all (page 1 only as a proxy)
      const inc = (result.items || []).filter(t => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
      const exp = (result.items || []).filter(t => t.transaction_type === 'expense' || t.transaction_type === 'salary').reduce((s, t) => s + Number(t.amount || 0), 0);
      setIncomeTotal(inc);
      setExpenseTotal(exp);
    } catch (e) {
      // silently fail — page still usable
    } finally {
      setLoadingRecent(false);
    }
  }, [token, organizationId]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  async function handleFinanceSearch(event) {
    event.preventDefault();

    const rawQuestion = financeQuestion.trim();

    if (!rawQuestion || !token || !organizationId) {
      return;
    }

    setFinanceSearchLoading(true);
    setFinanceSearchError('');

    try {
      const response = await post(
        endpoints.ragAnswer,
        {
          query: rawQuestion,
          top_k: 8,
          include_pending_review: true
        },
        authHeaders
      );

      setFinanceSearchResult(buildFinanceSearchResult(response, rawQuestion));
    } catch (requestError) {
      setFinanceSearchResult(null);
      setFinanceSearchError(requestError.message || 'Unable to search transactions right now.');
    } finally {
      setFinanceSearchLoading(false);
    }
  }

  function handleFieldChange(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // auto-set sensible category when type changes
      if (field === 'transaction_type') {
        if (value === 'income') next.category = 'funding';
        else if (value === 'expense') next.category = 'software';
        else if (value === 'salary') next.category = 'payroll';
      }
      return next;
    });
    setError('');
    setNotice('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await post(endpoints.transactions, {
        amount: parseFloat(form.amount),
        vendor: form.vendor,
        transaction_type: form.transaction_type,
        category: form.category,
        transaction_date: form.transaction_date,
      }, authHeaders);
      markDashboardSnapshotStale(organizationId);
      setNotice(`✓ Entry recorded: ${form.vendor} — ${formatCurrency(form.amount)}`);
      setForm({ ...EMPTY_FORM, transaction_type: form.transaction_type });
      fetchRecent();
    } catch (err) {
      setError(err.message || 'Failed to record entry.');
    } finally {
      setSubmitting(false);
    }
  }

  const meta = TYPE_META[form.transaction_type] || TYPE_META.income;
  const categories = form.transaction_type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const financeStatCards = financeSearchResult ? buildFinanceStatCards(financeSearchResult) : [];
  const financeContextTags = financeSearchResult
    ? [
        { label: 'Mode', value: formatLabel(financeSearchResult.mode) },
        financeSearchResult.intent ? { label: 'Intent', value: formatLabel(financeSearchResult.intent) } : null,
        financeSearchResult.plan?.vendor ? { label: 'Vendor', value: financeSearchResult.plan.vendor } : null,
        financeSearchResult.plan?.transaction_type ? { label: 'Type', value: formatLabel(financeSearchResult.plan.transaction_type) } : null,
        financeSearchResult.comparisonLabel ? { label: 'Period', value: financeSearchResult.comparisonLabel } : null,
        financeSearchResult.query && financeSearchResult.query !== financeSearchResult.original_question
          ? { label: 'Query Used', value: financeSearchResult.query }
          : null
      ].filter(Boolean)
    : [];

  return (
    <div className="premium-page-container">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 6px 0' }}>Record Entry</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Manually log income, funding rounds, or business expenses directly into your ledger.
        </p>
      </div>

      {/* Quick Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Recent Income', value: formatCurrency(incomeTotal), color: '#22c55e', icon: '↑' },
          { label: 'Recent Expense', value: formatCurrency(expenseTotal), color: '#ef4444', icon: '↓' },
          { label: 'Net (Page)', value: formatCurrency(incomeTotal - expenseTotal), color: incomeTotal >= expenseTotal ? '#22c55e' : '#ef4444', icon: '≈' },
        ].map(s => (
          <div key={s.label} className="premium-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: s.color, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="premium-card" style={{ marginBottom: '28px' }}>
        <div className="premium-card-header">
          <h3 className="premium-card-title">Finance Search</h3>
        </div>
        <div style={{ padding: '24px' }}>
          <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Ask in plain English. This now sends your full prompt to the backend planner, which decides whether to run a summary, comparison, lookup, or grounded search against the new AI endpoints.
          </p>

          <form onSubmit={handleFinanceSearch} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={financeQuestion}
              onChange={(event) => {
                setFinanceQuestion(event.target.value);
                setFinanceSearchError('');
              }}
              placeholder="e.g. how much did we spend on adobe systems"
              style={{ ...inputStyle, flex: '1 1 420px' }}
            />
            <button
              type="submit"
              disabled={financeSearchLoading || !financeQuestion.trim()}
              style={{ whiteSpace: 'nowrap', padding: '0 18px' }}
            >
              {financeSearchLoading ? 'Searching…' : 'Search Finance'}
            </button>
          </form>

          {financeSearchError && (
            <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '7px', background: 'var(--error-bg, rgba(239,68,68,0.1))', border: '1px solid var(--error-border, rgba(239,68,68,0.3))', color: 'var(--error-text, #ef4444)', fontSize: '0.875rem' }}>
              {financeSearchError}
            </div>
          )}

          {financeSearchResult && !financeSearchLoading && (
            <div style={{ marginTop: '18px', display: 'grid', gap: '16px' }}>
              <div style={{ padding: '16px 18px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Original Question
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                    {financeSearchResult.original_question}
                  </span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
                  {financeSearchResult.answer}
                </p>
                {financeContextTags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
                    {financeContextTags.map((tag) => (
                      <span
                        key={`${tag.label}-${tag.value}`}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '999px',
                          border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.45)',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <strong style={{ color: 'var(--text-primary)' }}>{tag.label}:</strong> {tag.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                {financeStatCards.map((card) => (
                  <div key={card.label} className="premium-card" style={{ padding: '16px 18px' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      {card.label}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{card.value}</div>
                    {card.label === 'Delta' && financeSearchResult.percentageChange != null ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {financeSearchResult.percentageChange >= 0 ? '+' : ''}{financeSearchResult.percentageChange}%
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {financeSearchResult.breakdown.length > 0 ? (
                <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="premium-card-header">
                    <h3 className="premium-card-title">
                      {formatLabel(financeSearchResult.plan?.group_by || 'category')} Breakdown
                    </h3>
                  </div>
                  <div>
                    {financeSearchResult.breakdown.slice(0, 5).map((row, index) => (
                      <div
                        key={row.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '14px 22px',
                          borderBottom: index < financeSearchResult.breakdown.slice(0, 5).length - 1 ? '1px solid var(--border)' : 'none'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{row.label}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {row.transaction_count} transaction{row.transaction_count === 1 ? '' : 's'} · avg {formatCurrency(row.average_amount)}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                          {formatCurrency(row.total_amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="premium-card-header">
                  <h3 className="premium-card-title">Matching Transactions</h3>
                </div>
                {financeSearchResult.transactions.length ? (
                  <div>
                    {financeSearchResult.transactions.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '14px 22px',
                          borderBottom: index < financeSearchResult.transactions.length - 1 ? '1px solid var(--border)' : 'none'
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.vendor || 'Unknown Vendor'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {[item.category || 'Uncategorized', formatDate(item.transaction_date), item.similarity_score != null ? `score ${item.similarity_score.toFixed(2)}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '22px 24px', color: 'var(--text-secondary)' }}>
                    No matching transactions were found for this planner result.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Entry Form Card */}
        <div className="premium-card">
          <div className="premium-card-header">
            <h3 className="premium-card-title">New Entry</h3>
          </div>
          <div style={{ padding: '24px' }}>
            {notice && (
              <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '7px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.875rem' }}>
                {notice}
              </div>
            )}
            {error && (
              <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '7px', background: 'var(--error-bg, rgba(239,68,68,0.1))', border: '1px solid var(--error-border, rgba(239,68,68,0.3))', color: 'var(--error-text, #ef4444)', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Type Selector */}
              <div>
                <label style={labelStyle}>Entry Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {Object.entries(TYPE_META).map(([type, m]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleFieldChange('transaction_type', type)}
                      style={{
                        height: '40px',
                        borderRadius: '7px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: `1px solid ${form.transaction_type === type ? m.color : 'var(--border-strong)'}`,
                        background: form.transaction_type === type ? m.bg : 'transparent',
                        color: form.transaction_type === type ? m.color : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {m.label.split(' / ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount (USD)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => handleFieldChange('amount', e.target.value)}
                    required
                    style={{ ...inputStyle, paddingLeft: '28px', width: '100%' }}
                  />
                </div>
              </div>

              {/* Source / Vendor */}
              <div>
                <label style={labelStyle}>
                  {form.transaction_type === 'income' ? 'Source / Investor' : 'Vendor / Recipient'}
                </label>
                <input
                  type="text"
                  placeholder={form.transaction_type === 'income' ? 'e.g. Sequoia Capital, Stripe Revenue' : 'e.g. AWS, Notion, Figma'}
                  value={form.vendor}
                  onChange={e => handleFieldChange('vendor', e.target.value)}
                  required
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              {/* Category */}
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category}
                  onChange={e => handleFieldChange('category', e.target.value)}
                  style={{ ...inputStyle, width: '100%', textTransform: 'capitalize' }}
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={form.transaction_date}
                  onChange={e => handleFieldChange('transaction_date', e.target.value)}
                  required
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  height: '46px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  background: meta.color,
                  border: 'none',
                  color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Saving…' : `Record ${TYPE_META[form.transaction_type].label}`}
              </button>
            </form>
          </div>
        </div>

        {/* Recent Entries Card */}
        <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="premium-card-header">
            <h3 className="premium-card-title">Recent Entries</h3>
          </div>

          {loadingRecent ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <svg style={{ animation: 'spin 1s linear infinite' }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            </div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No entries yet. Record your first one  →
            </div>
          ) : (
            <div>
              {recent.map((tx, i) => {
                const m = TYPE_META[tx.transaction_type] || TYPE_META.income;
                return (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 22px',
                      borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.12s',
                      gap: '12px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-soft)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Type dot */}
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color, flexShrink: 0 }} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.vendor}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', textTransform: 'capitalize' }}>
                        {tx.category?.replace(/_/g, ' ')} · {formatDate(tx.transaction_date)}
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: m.color }}>
                        {tx.transaction_type === 'expense' || tx.transaction_type === 'salary' ? '−' : '+'}{formatCurrency(tx.amount)}
                      </div>
                      <div style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: m.bg, color: m.color, border: `1px solid ${m.border}`, display: 'inline-block', marginTop: '3px', textTransform: 'capitalize' }}>
                        {tx.transaction_type}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
            <a href="/transactions" style={{ fontSize: '0.82rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
              View all transactions →
            </a>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-secondary)',
  marginBottom: '8px',
};

const inputStyle = {
  height: '44px',
  borderRadius: '7px',
  border: '1px solid var(--border-strong)',
  background: 'var(--input-bg, #fff)',
  color: 'var(--text)',
  padding: '0 14px',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'border-color 0.15s',
};
