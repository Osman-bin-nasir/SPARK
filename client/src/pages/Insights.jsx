import { useState, useEffect, useCallback } from 'react';
import { get, patch } from '../services/http';
import { endpoints } from '../services/endpoints';

function formatCurrency(val) {
  if (val == null || Number.isNaN(Number(val))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(val));
}

function formatPercent(val) {
  if (val == null || Number.isNaN(Number(val))) return '0%';
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(1)}%`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function InsightsPage({ activeOrganizationId, token, user }) {
  const myRole = user?.organizations?.find(o => o.id === activeOrganizationId)?.role || 'member';
  const isAllowedToEdit = ['founder', 'co-founder', 'admin'].includes(myRole);

  const [activeTab, setActiveTab] = useState('weekly'); // 'weekly' or 'monthly'
  const [orgInfo, setOrgInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [insightsData, setInsightsData] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [configError, setConfigError] = useState('');
  const [insightsError, setInsightsError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [togglingMemberId, setTogglingMemberId] = useState('');

  const authHeaders = { token, headers: { 'X-Organization-Id': activeOrganizationId } };

  // Fetch settings & members
  const fetchConfig = useCallback(async () => {
    if (!token || !activeOrganizationId) {
      setLoadingConfig(false);
      return;
    }
    try {
      setLoadingConfig(true);
      setConfigError('');
      const result = await get(endpoints.organizationsTeam, authHeaders);
      setOrgInfo(result.organization || null);
      setMembers(result.members || []);
    } catch (err) {
      setConfigError(err.message || 'Failed to load organization settings.');
    } finally {
      setLoadingConfig(false);
    }
  }, [token, activeOrganizationId]);

  // Fetch insights calculations
  const fetchInsights = useCallback(async () => {
    if (!token || !activeOrganizationId) {
      setLoadingInsights(false);
      return;
    }
    try {
      setLoadingInsights(true);
      setInsightsError('');
      const result = await get(`${endpoints.insights}?period=${activeTab}`, authHeaders);
      setInsightsData(result);
    } catch (err) {
      setInsightsError(err.message || `Failed to load ${activeTab} insights.`);
      setInsightsData(null);
    } finally {
      setLoadingInsights(false);
    }
  }, [token, activeOrganizationId, activeTab]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Update insights frequency or recipients type
  async function handleUpdateSettings(frequency, recipients) {
    if (!isAllowedToEdit || savingSettings) return;
    setSavingSettings(true);
    setNotice('');
    try {
      const result = await patch(
        endpoints.organizationsSettings,
        {
          insights_frequency: frequency || orgInfo?.insights_frequency,
          insights_recipients: recipients || orgInfo?.insights_recipients
        },
        authHeaders
      );
      setOrgInfo(prev => ({
        ...prev,
        insights_frequency: result.insights_frequency,
        insights_recipients: result.insights_recipients
      }));
      setNotice('AI Insights configuration saved.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setConfigError(err.message || 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Toggle individual member receive_insights flag
  async function handleToggleMemberInsights(userId, currentVal) {
    if (!isAllowedToEdit || togglingMemberId) return;
    setTogglingMemberId(userId);
    try {
      const result = await patch(
        `${endpoints.organizationsTeamMembers}/${userId}`,
        { receive_insights: !currentVal },
        authHeaders
      );
      setMembers(prev =>
        prev.map(m => (m.user_id === userId ? { ...m, receive_insights: result.receive_insights } : m))
      );
    } catch (err) {
      setConfigError(err.message || 'Failed to update recipient preference.');
    } finally {
      setTogglingMemberId('');
    }
  }

  // Helpers to check frequency states
  const frequency = orgInfo?.insights_frequency || 'none';
  const recipients = orgInfo?.insights_recipients || 'all';

  return (
    <div className="premium-page-container">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.4))' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          AI Financial Insights
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Smart forecasting, spike alerts, and automated reporting delivered straight to your Slack, WhatsApp, or Telegram.
        </p>
      </div>

      {notice && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '0.875rem' }}>
          {notice}
        </div>
      )}
      {configError && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: '0.875rem' }}>
          {configError}
        </div>
      )}

      {/* Configuration Control Center Card (Founder/Admin view) */}
      <div className="premium-card" style={{ marginBottom: '32px' }}>
        <div className="premium-card-header">
          <h3 className="premium-card-title">AI Insights Delivery Preferences</h3>
        </div>
        {loadingConfig ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading configuration...</div>
        ) : (
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
              
              {/* Frequency Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                  Report Schedule
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['none', 'weekly', 'monthly'].map(f => {
                    const active = frequency === f;
                    return (
                      <button
                        key={f}
                        onClick={() => handleUpdateSettings(f, null)}
                        disabled={!isAllowedToEdit || savingSettings}
                        style={{
                          flex: 1,
                          height: '42px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          textTransform: 'capitalize',
                          background: active ? 'rgba(139, 92, 246, 0.12)' : 'var(--panel)',
                          color: active ? '#a855f7' : 'var(--text-secondary)',
                          border: active ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid var(--border)',
                          boxShadow: 'none',
                          cursor: isAllowedToEdit ? 'pointer' : 'default',
                        }}
                      >
                        {f === 'none' ? 'Disabled' : f}
                      </button>
                    );
                  })}
                </div>
                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Choose how often SPARK metrics compiles your transactions into summaries and delivers them.
                </p>
              </div>

              {/* Recipients Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                  Target Recipients
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'all', label: 'All Members' },
                    { value: 'admins', label: 'Admins Only' },
                    { value: 'selected', label: 'Selected' }
                  ].map(r => {
                    const active = recipients === r.value;
                    return (
                      <button
                        key={r.value}
                        onClick={() => handleUpdateSettings(null, r.value)}
                        disabled={!isAllowedToEdit || savingSettings || frequency === 'none'}
                        style={{
                          flex: 1,
                          height: '42px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          background: active ? 'rgba(139, 92, 246, 0.12)' : 'var(--panel)',
                          color: active ? '#a855f7' : 'var(--text-secondary)',
                          border: active ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid var(--border)',
                          boxShadow: 'none',
                          cursor: isAllowedToEdit && frequency !== 'none' ? 'pointer' : 'default',
                          opacity: frequency === 'none' ? 0.4 : 1,
                        }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Configure access. If "Selected" is chosen, configure target contacts below.
                </p>
              </div>
            </div>

            {/* Selected individuals list toggles */}
            {recipients === 'selected' && frequency !== 'none' && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                  Select Recipients List
                </label>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {members.map(m => {
                    const isLinked = m.telegram_id || m.whatsapp_id;
                    return (
                      <div
                        key={m.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'var(--panel-soft)',
                          border: '1px solid var(--border)',
                          opacity: isLinked ? 1 : 0.6
                        }}
                      >
                        <div style={{ overflow: 'hidden', marginRight: '10px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {m.email}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            {m.telegram_id && <span style={{ color: '#2AABEE' }}>Telegram</span>}
                            {m.whatsapp_id && <span style={{ color: '#25D366' }}>WhatsApp</span>}
                            {!isLinked && <span>No Contacts Linked</span>}
                          </div>
                        </div>
                        {isLinked && (
                          <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                            <input
                              type="checkbox"
                              checked={m.receive_insights}
                              onChange={() => handleToggleMemberInsights(m.user_id, m.receive_insights)}
                              disabled={!isAllowedToEdit || togglingMemberId === m.user_id}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', cursor: isAllowedToEdit ? 'pointer' : 'default',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: m.receive_insights ? '#a855f7' : 'var(--border-strong)',
                              transition: '.2s', borderRadius: '20px'
                            }}>
                              <span style={{
                                position: 'absolute', content: '""',
                                height: '14px', width: '14px',
                                left: m.receive_insights ? '18px' : '3px', bottom: '3px',
                                backgroundColor: 'white', transition: '.2s',
                                borderRadius: '50%'
                              }} />
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dashboard View Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {[
          { id: 'weekly', label: 'Weekly Dashboard' },
          { id: 'monthly', label: 'Monthly Dashboard' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '12px 24px',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: activeTab === t.id ? 'var(--text)' : 'var(--text-secondary)',
              borderBottom: activeTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent',
              background: 'transparent',
              borderLeft: 'none', borderRight: 'none', borderTop: 'none',
              boxShadow: 'none',
              transform: 'none',
              borderRadius: 0,
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Insights Display Section */}
      {loadingInsights ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <svg style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <div>Loading Smart Financial Metrics…</div>
        </div>
      ) : insightsError || !insightsData ? (
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--panel-soft)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
          {insightsError || 'No transactions found. Link a financial Google sheet to begin generating insights.'}
        </div>
      ) : (
        <div>
          {/* Top Level Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            
            {/* Outflow overview */}
            <div className="premium-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                Total Outflow ({activeTab === 'weekly' ? 'Week' : 'Month'})
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
                <span style={{ fontSize: '2rem', fontWeight: 700 }}>{formatCurrency(insightsData.metrics?.total_outflow)}</span>
                {insightsData.metrics?.change_pct !== null && (
                  <span style={{
                    fontSize: '0.85rem', fontWeight: 600,
                    color: insightsData.metrics.change_pct > 0 ? '#ef4444' : '#22c55e',
                    background: insightsData.metrics.change_pct > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    padding: '2px 8px', borderRadius: '4px'
                  }}>
                    {formatPercent(insightsData.metrics.change_pct)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Compared to {formatCurrency(insightsData.metrics?.previous_outflow)} in the previous period.
              </div>
            </div>

            {/* Top Category Card */}
            {activeTab === 'weekly' && insightsData.top_category ? (
              <div className="premium-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  Top Category Spend
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, margin: '6px 0', textTransform: 'capitalize' }}>
                  {insightsData.top_category.category}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Totaled <strong>{formatCurrency(insightsData.top_category.amount)}</strong>, taking up <strong>{insightsData.top_category.pct_of_total.toFixed(0)}%</strong> of all outflows this week.
                </div>
              </div>
            ) : activeTab === 'monthly' && insightsData.top_categories?.length > 0 ? (
              <div className="premium-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  Primary Categories spend
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {insightsData.top_categories.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ textTransform: 'capitalize', color: 'var(--text)' }}>{c.category}</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(c.amount)} ({c.pct_of_total.toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="premium-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                No category data available.
              </div>
            )}

            {/* Runway projections (Monthly only) */}
            {activeTab === 'monthly' && insightsData.runway ? (
              <div className="premium-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  Remaining Runway
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: insightsData.runway.runway_months < 6 ? '#ef4444' : '#22c55e' }}>
                    {insightsData.runway.runway_months !== null ? `${insightsData.runway.runway_months.toFixed(1)} months` : '—'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Burn rate: <strong>{formatCurrency(insightsData.runway.monthly_burn)}/mo</strong>. Depletion: {insightsData.runway.estimated_depletion_month || 'N/A'}.
                </div>
              </div>
            ) : null}
          </div>

          {/* Double Column Breakdown Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            
            {/* Vendor Spikes */}
            <div className="premium-card" style={{ padding: '24px' }}>
              <div className="premium-card-header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Significant Vendor Spikes</h4>
              </div>
              <div style={{ marginTop: '16px' }}>
                {insightsData.vendor_spikes?.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                    No significant vendor spikes detected.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {insightsData.vendor_spikes?.map((vs, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{vs.vendor}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {vs.previous_amount > 0 ? `Was ${formatCurrency(vs.previous_amount)} last period` : 'New Vendor'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{formatCurrency(vs.amount)}</div>
                          {vs.change_pct !== null && (
                            <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}>
                              📈 {vs.change_pct.toFixed(0)}% spike
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Budget warnings / audit */}
            <div className="premium-card" style={{ padding: '24px' }}>
              <div className="premium-card-header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                  {activeTab === 'weekly' ? 'Weekly Budget Alerts' : 'Monthly Budget Audit'}
                </h4>
              </div>
              <div style={{ marginTop: '16px' }}>
                {((activeTab === 'weekly' ? insightsData.budget_alerts : insightsData.budget_audit) || []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                    No budget alerts or warning thresholds crossed. Excellent control!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {((activeTab === 'weekly' ? insightsData.budget_alerts : insightsData.budget_audit) || []).map((ba, idx) => {
                      const isExceeded = ba.status === 'exceeded';
                      return (
                        <div key={idx} style={{ background: 'var(--panel-soft)', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${isExceeded ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>{ba.category}</span>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                              color: isExceeded ? '#ef4444' : '#f59e0b',
                              background: isExceeded ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              textTransform: 'uppercase'
                            }}>
                              {ba.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span>Spent: <strong>{formatCurrency(ba.actual_spend)}</strong></span>
                            <span>Limit: <strong>{formatCurrency(ba.monthly_limit)}</strong></span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(ba.ratio * 100, 100)}%`,
                              height: '100%',
                              background: isExceeded ? '#ef4444' : '#f59e0b'
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
