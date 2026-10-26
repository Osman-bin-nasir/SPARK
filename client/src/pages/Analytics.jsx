import { useState, useEffect } from 'react';
import { get } from '../services/http';
import { endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';

export default function AnalyticsPage({ activeOrganizationId, token }) {
  const [timeframe, setTimeframe] = useState('6m');
  return <AnalyticsContent key={`${activeOrganizationId}:${timeframe}`} activeOrganizationId={activeOrganizationId} token={token} timeframe={timeframe} setTimeframe={setTimeframe} />;
}

function AnalyticsContent({ activeOrganizationId, token, timeframe, setTimeframe }) {
  const key = `${activeOrganizationId}:${timeframe}`;
  const [cached] = useState(() => pageCache.get('analytics', key));
  const [data, setData] = useState(cached?.data || null);
  const [loading, setLoading] = useState(!cached && Boolean(activeOrganizationId));
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token || !activeOrganizationId) return;
    const controller = new AbortController();
    if (cached && !pageCache.isStale('analytics', key) && !reload) return;
    get(`${endpoints.performance}?range=${timeframe}`, {
      token, headers: { 'X-Organization-Id': activeOrganizationId }, signal: controller.signal
    }).then(result => {
      if (controller.signal.aborted) return;
      pageCache.set('analytics', key, result);
      setData(result);
    }).catch(requestError => {
      if (!controller.signal.aborted && requestError.name !== 'AbortError') setError(requestError.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeOrganizationId, token, timeframe, reload, key, cached]);

  if (loading && !data) return <div className="premium-page-container" style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading analytics...</div>;
  if (!data) return <div className="card" role={error ? 'alert' : 'status'}>
    <p>{error || 'Select a workspace to view analytics.'}</p>
    {error && <button type="button" onClick={() => setReload(value => value + 1)}>Retry analytics</button>}
  </div>;

  return (
    <div className="premium-page-container">
      <style>
        {`
          .analytics-header { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
          .analytics-title { font-size: 1.5rem; font-weight: 600; margin: 0 0 8px 0; }
          .analytics-subtitle { color: var(--text-secondary); margin: 0; font-size: 0.9rem; }
          .timeframe-toggles { display: flex; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 4px; }
          .timeframe-btn { background: transparent; border: none; color: var(--text-secondary); padding: 6px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 150ms ease; }
          .timeframe-btn.active { background: var(--border); color: var(--text-primary); }
          .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 32px; }
          .chart-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 32px; }
          .analytics-metric-card { padding: 22px 24px; }
          .analytics-chart-body { padding: 20px 22px 22px; }
          @media (max-width: 1024px) { .chart-grid { grid-template-columns: 1fr; } .metrics-row { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 560px) { .metrics-row { grid-template-columns: 1fr; } .timeframe-toggles { flex-wrap: wrap; } }
        `}
      </style>

      <div className="analytics-header">
        <div>
          <h2 className="analytics-title">Performance Analytics</h2>
          <p className="analytics-subtitle">Deep dive into spend patterns and category breakdowns.</p>
        </div>
        <div className="timeframe-toggles">
          <button className={`timeframe-btn ${timeframe === 'monthly' ? 'active' : ''}`} onClick={() => setTimeframe('monthly')}>This month</button>
          <button className={`timeframe-btn ${timeframe === '3m' ? 'active' : ''}`} onClick={() => setTimeframe('3m')}>3 Months</button>
          <button className={`timeframe-btn ${timeframe === '6m' ? 'active' : ''}`} onClick={() => setTimeframe('6m')}>6 Months</button>
          <button className={`timeframe-btn ${timeframe === '1y' ? 'active' : ''}`} onClick={() => setTimeframe('1y')}>1 Year</button>
        </div>
      </div>

      {error && <p role="alert">{error} Showing previously loaded data.</p>}
      <div className="metrics-row">
        <div className="premium-card analytics-metric-card">
          <span className="premium-label">Total Spend</span>
          <h3 className="premium-metric" style={{ fontSize: '2rem' }}>${Number(data.summary?.total_outflow || 0).toLocaleString()}</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.8rem' }}>Expenses and payroll</p>
        </div>
        <div className="premium-card analytics-metric-card">
          <span className="premium-label">Avg Monthly Outflow</span>
          <h3 className="premium-metric" style={{ fontSize: '2rem' }}>${Number((data.summary?.total_outflow || 0)/(data.monthly_breakdown?.length || 1)).toLocaleString(undefined, {maximumFractionDigits:0})}</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.8rem' }}>Based on active months</p>
        </div>
        <div className="premium-card analytics-metric-card">
          <span className="premium-label">Top Category</span>
          <h3 className="premium-metric" style={{ fontSize: '1.5rem', marginTop: '8px' }}>{data.category_breakdown?.[0]?.category || 'N/A'}</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.8rem' }}>{Math.round(((data.category_breakdown?.[0]?.total_outflow || 0) / (data.summary?.total_outflow || 1)) * 100)}% of total</p>
        </div>
        <div className="premium-card analytics-metric-card">
          <span className="premium-label">Transaction Count</span>
          <h3 className="premium-metric" style={{ fontSize: '2rem' }}>{data.summary?.transaction_count || 0}</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.8rem' }}>Processed successfully</p>
        </div>
      </div>

      <div className="chart-grid">
        <div className="premium-card">
          <div className="premium-card-header">
             <h3 className="premium-card-title">Spend Trend</h3>
          </div>
          <div className="analytics-chart-body" style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer>
              <AreaChart data={data.monthly_breakdown || []}>
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <RechartsTooltip 
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--accent-blue)' }}
                />
                <Area type="monotone" dataKey="total_outflow" stroke="var(--accent-blue)" strokeWidth={3} fillOpacity={1} fill="url(#colorGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="premium-card">
          <div className="premium-card-header">
             <h3 className="premium-card-title">By Category</h3>
          </div>
          <div className="analytics-chart-body" style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={data.category_breakdown || []} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="category" type="category" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  cursor={{ fill: 'var(--border)', opacity: 0.4 }}
                />
                <Bar dataKey="total_outflow" fill="var(--accent-blue)" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
