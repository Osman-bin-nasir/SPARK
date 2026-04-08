import React, { useState, useEffect } from 'react';
import { get, patch } from '../services/http';
import { endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', vendor: '' });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchTransactions = async () => {
    const cacheQuery = JSON.stringify({ page, filters });
    const cached = pageCache.get('transactions', cacheQuery);

    if (cached) {
      setTransactions(cached.data.items || []);
      setLoading(false);
      if (!pageCache.isStale('transactions', cacheQuery)) return;
    }

    if (!cached) setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        pageSize: 50,
        ...(filters.status && { status: filters.status }),
        ...(filters.vendor && { vendor: filters.vendor })
      });
      const res = await get(`${endpoints.transactions}?${params}`);
      
      pageCache.set('transactions', cacheQuery, res);
      setTransactions(res.items || []);
    } catch (e) {
      if (!cached) console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, filters]);

  const handleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setExpandedData(null);
    try {
      const res = await get(`${endpoints.transactions}/${id}`);
      setExpandedData(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (tx) => {
    setEditingId(tx.id);
    setEditForm({ vendor: tx.vendor, category: tx.category, amount: tx.amount });
  };

  const handleSave = async (id) => {
    try {
      await patch(`${endpoints.transactions}/${id}`, editForm);
      setEditingId(null);
      // Bust namespace cache because edits change the list
      pageCache.bustNs('transactions');
      fetchTransactions();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="premium-page-container">
      <style>
        {`
          .premium-page-container { padding: 0; }
          .premium-table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .premium-table-title { font-size: 1.5rem; font-weight: 600; margin: 0; }
          .premium-controls { display: flex; gap: 12px; }
          .premium-input, .premium-select { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
          .premium-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 150ms ease; }
          .premium-btn:hover { background: var(--border); }
          .premium-table-wrapper { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
          .premium-table { width: 100%; border-collapse: collapse; text-align: left; }
          .premium-table th { padding: 16px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); border-bottom: 1px solid var(--border); font-weight: 600; }
          .premium-table td { padding: 16px; font-size: 0.9rem; border-bottom: 1px solid var(--border); color: var(--text-primary); transition: background 150ms ease; }
          .premium-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
          .premium-table tbody tr:last-child td { border-bottom: none; }
          .premium-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 100px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
          .badge-green { background: rgba(34, 197, 94, 0.1); color: var(--accent-green); border: 1px solid rgba(34, 197, 94, 0.2); }
          .badge-yellow { background: rgba(234, 179, 8, 0.1); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.2); }
          .badge-red { background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border: 1px solid rgba(239, 68, 68, 0.2); }
          .premium-ghost-btn { background: transparent; border: none; color: var(--accent-blue); font-size: 0.85rem; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
          .premium-ghost-btn:hover { background: rgba(59, 130, 246, 0.1); }
          .premium-ocr-panel { background: rgba(0,0,0,0.02); padding: 24px; border-bottom: 1px solid var(--border); }
          .dark .premium-ocr-panel { background: rgba(255,255,255,0.02); }
          .premium-ocr-grid { display: grid; gap: 12px; font-size: 0.85rem; }
          .premium-ocr-pre { background: var(--bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border); white-space: pre-wrap; font-family: monospace; color: var(--text-secondary); max-height: 200px; overflow-y: auto; }
        `}
      </style>

      <div className="premium-table-header">
        <h2 className="premium-table-title">Transactions</h2>
        <div className="premium-controls">
          <select className="premium-select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            <option value="auto_verified">Auto Verified</option>
            <option value="pending_review">Pending Review</option>
          </select>
          <input 
            className="premium-input"
            type="text" 
            placeholder="Search vendor..." 
            value={filters.vendor} 
            onChange={e => setFilters({ ...filters, vendor: e.target.value })}
          />
          <button className="premium-btn" onClick={() => fetchTransactions()}>Search</button>
        </div>
      </div>

      <div className="premium-table-wrapper">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading transactions...</td></tr>}
            {!loading && transactions.map(tx => (
              <React.Fragment key={tx.id}>
                <tr>
                  <td>{new Date(tx.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {editingId === tx.id ? 
                        <input className="premium-input" style={{width: '100%', padding: '4px 8px'}} value={editForm.vendor} onChange={e => setEditForm({...editForm, vendor: e.target.value})} /> 
                        : <span style={{ fontWeight: 500 }}>{tx.vendor}</span>
                      }
                      {tx.duplicate_score > 0.8 && <span className="premium-badge badge-red" style={{ padding: '2px 6px', fontSize: '10px' }}>Possible Dup</span>}
                    </div>
                  </td>
                  <td>
                    {editingId === tx.id ? 
                      <input className="premium-input" style={{width: '100%', padding: '4px 8px'}} value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} /> 
                      : <span style={{ color: 'var(--text-secondary)' }}>{tx.category}</span>
                    }
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {editingId === tx.id ? 
                      <input className="premium-input" style={{width: '100%', padding: '4px 8px'}} value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} /> 
                      : `$${Number(tx.amount).toFixed(2)}`
                    }
                  </td>
                  <td>
                    <span className={`premium-badge ${tx.status === 'auto_verified' ? 'badge-green' : 'badge-yellow'}`}>
                      {tx.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="premium-ghost-btn" onClick={() => handleExpand(tx.id)}>{expandedId === tx.id ? 'Hide OCR' : 'View OCR'}</button>
                      {editingId === tx.id ? 
                        <button className="premium-ghost-btn" style={{ color: 'var(--accent-green)' }} onClick={() => handleSave(tx.id)}>Save</button> 
                        : <button className="premium-ghost-btn" onClick={() => handleEdit(tx)}>Edit</button>
                      }
                    </div>
                  </td>
                </tr>
                {expandedId === tx.id && (
                  <tr>
                    <td colSpan="6" style={{ padding: 0 }}>
                      <div className="premium-ocr-panel">
                        {expandedData ? (
                          <div className="premium-ocr-grid">
                            <div style={{ display: 'flex', gap: '24px' }}>
                              <div>
                                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Extraction Confidence</span>
                                <strong style={{ color: (expandedData.document?.extraction_confidence || tx.confidence_score) > 0.8 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                                  {Number((expandedData.document?.extraction_confidence || tx.confidence_score) * 100).toFixed(1)}%
                                </strong>
                              </div>
                              {tx.duplicate_score > 0.8 && (
                                <div>
                                  <span style={{ color: 'var(--accent-red)', display: 'block', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>Duplicate Warning</span>
                                  <strong>Matches #{tx.duplicate_of_transaction_id?.substring(0,8)}...</strong>
                                </div>
                              )}
                            </div>
                            <div style={{ marginTop: '12px' }}>
                              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}>Raw Extracted Text</span>
                              <div className="premium-ocr-pre">{expandedData.document?.extracted_text || 'No raw text available'}</div>
                            </div>
                          </div>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>Loading secure payload...</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Showing page {page}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="premium-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="premium-btn" disabled={transactions.length < 50} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
