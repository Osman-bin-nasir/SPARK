import { useState, useEffect, useCallback } from 'react';
import { post, get } from '../services/http';
import { endpoints } from '../services/endpoints';

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

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

const EMPTY_FORM = {
  transaction_type: 'income',
  amount: '',
  vendor: '',
  category: 'funding',
  transaction_date: new Date().toISOString().slice(0, 10),
  notes: '',
};

export default function FinancePage() {
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const organizationId = user?.organizations?.[0]?.id || '';
  const authHeaders = { token, headers: { 'X-Organization-Id': organizationId } };

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Totals
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);

  const fetchRecent = useCallback(async () => {
    if (!token || !organizationId) { setLoadingRecent(false); return; }
    try {
      setLoadingRecent(true);
      const result = await get(`${endpoints.transactions}?page_size=8`, authHeaders);
      setRecent(result.items || []);
      // compute quick totals from all (page 1 only as a proxy)
      const inc = (result.items || []).filter(t => t.transaction_type === 'income' || t.transaction_type === 'salary').reduce((s, t) => s + Number(t.amount || 0), 0);
      const exp = (result.items || []).filter(t => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
      setIncomeTotal(inc);
      setExpenseTotal(exp);
    } catch (e) {
      // silently fail — page still usable
    } finally {
      setLoadingRecent(false);
    }
  }, [token, organizationId]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

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
                        {tx.transaction_type === 'expense' ? '−' : '+'}{formatCurrency(tx.amount)}
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
