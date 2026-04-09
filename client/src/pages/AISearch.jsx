import { useState } from 'react';
import { get, post } from '../services/http';
import { endpoints } from '../services/endpoints';

export default function AISearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && query.trim() && !loading) {
      setLoading(true);
      setError('');
      try {
        const res = await post(endpoints.ragAnswer, { query });
        setResponse(res);
      } catch (err) {
        console.error(err);
        setError('Failed to get answer.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="premium-page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '800px', margin: '0 auto', paddingTop: '8vh' }}>
      <style>
        {`
          .ai-search-wrapper { width: 100%; position: relative; margin-bottom: 40px; }
          .ai-input { width: 100%; background: var(--card); border: 1px solid var(--border); color: var(--text-primary); padding: 20px 24px 20px 60px; border-radius: 16px; font-size: 1.25rem; font-family: 'Inter', sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.05); transition: all 200ms ease; }
          .dark .ai-input { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
          .ai-input:focus { outline: none; border-color: var(--accent-blue); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 8px 32px rgba(0,0,0,0.4); }
          .ai-icon { position: absolute; left: 24px; top: 50%; transform: translateY(-50%); color: var(--accent-blue); opacity: 0.8; }
          .ai-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(59, 130, 246, 0.1); color: var(--accent-blue); padding: 6px 12px; border-radius: 100px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 24px; }
          .ai-response-card { width: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px; animation: slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1); }
          .ai-answer-text { font-size: 1.1rem; line-height: 1.6; color: var(--text-primary); margin: 0 0 24px 0; }
          .ai-source-list { display: flex; flex-direction: column; gap: 12px; }
          .ai-source-item { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: rgba(0,0,0,0.02); border: 1px solid var(--border); border-radius: 8px; transition: background 150ms ease; }
          .dark .ai-source-item { background: rgba(255,255,255,0.02); }
          .ai-source-item:hover { background: rgba(0,0,0,0.04); }
          .dark .ai-source-item:hover { background: rgba(255,255,255,0.04); }
          .source-vendor { font-weight: 600; font-size: 1rem; color: var(--text-primary); }
          .source-meta { font-size: 0.85rem; color: var(--text-secondary); }
          .source-amount { font-weight: 600; font-size: 1.1rem; color: var(--text-primary); }
          .shimmer { animation: shimmer 2s infinite linear; background: linear-gradient(to right, var(--text-secondary) 4%, var(--text-primary) 25%, var(--text-secondary) 36%); background-size: 1000px 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
        `}
      </style>

      <div className="ai-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Spark Intelligence
      </div>

      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 40px 0', textAlign: 'center', letterSpacing: '-0.02em' }}>
        Ask anything about your finances.
      </h1>

      <div className="ai-search-wrapper">
        <svg className="ai-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input 
          className="ai-input"
          placeholder="e.g. How much did we spend on AWS last month?"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearch}
          disabled={loading}
          autoFocus
        />
      </div>

      {loading && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
           <span className="shimmer" style={{ fontSize: '1.1rem', fontWeight: 500 }}>Scanning transactions and analyzing data...</span>
        </div>
      )}

      {error && <div style={{ color: 'var(--accent-red)' }}>{error}</div>}

      {response && !loading && (
        <div className="ai-response-card">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', flexShrink: 0 }} />
            <p className="ai-answer-text">{response.answer}</p>
          </div>
          
          {response.items && response.items.length > 0 && (
            <div>
              <p style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 600 }}>Sources</p>
              <div className="ai-source-list">
                {response.items.map(tx => (
                  <div key={tx.id} className="ai-source-item">
                    <div>
                      <div className="source-vendor">{tx.vendor}</div>
                      <div className="source-meta">{new Date(tx.transaction_date).toLocaleDateString()} • {tx.category}</div>
                    </div>
                    <div className="source-amount">${Number(tx.amount).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
