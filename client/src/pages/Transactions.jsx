import React, { useEffect, useState } from 'react';
import { get, patch } from '../services/http';
import { API_BASE_URL, endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

const GOOGLE_SHEET_WINDOWS = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' }
];

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

export default function TransactionsPage({ activeOrganizationId, token: tokenProp, user: userProp, userSettings }) {
  const token = tokenProp || localStorage.getItem('token') || '';
  const user = userProp || JSON.parse(localStorage.getItem('user') || 'null');
  const organizationId = activeOrganizationId || resolveActiveOrganizationId(user);
  const pageSize = Number(userSettings?.transactions_page_size) || 50;
  const preferredSheetRange = userSettings?.default_google_sheet_range || '1m';
  const authHeaders = {
    token,
    headers: organizationId ? { 'X-Organization-Id': organizationId } : {}
  };

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', vendor: '' });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sheetRange, setSheetRange] = useState(preferredSheetRange);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetInfo, setSheetInfo] = useState(null);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  useEffect(() => {
    setSheetError('');
    setSheetInfo(null);
  }, [organizationId]);

  useEffect(() => {
    setSheetRange(preferredSheetRange);
  }, [preferredSheetRange]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const fetchTransactions = async () => {
    if (!token || !organizationId) {
      setTransactions([]);
      return;
    }

    const cacheQuery = JSON.stringify({ organizationId, page, filters });
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
        pageSize,
        ...(filters.status && { status: filters.status }),
        ...(filters.vendor && { vendor: filters.vendor })
      });
      const res = await get(`${endpoints.transactions}?${params}`, authHeaders);
      
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
  }, [filters, organizationId, page, pageSize]);

  const handleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      setPreviewError('');
      setLoadingPreview(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    setExpandedId(id);
    setExpandedData(null);
    setPreviewError('');
    try {
      const res = await get(`${endpoints.transactions}/${id}`, authHeaders);
      setExpandedData(res);

      if (res.document) {
        setLoadingPreview(true);
        try {
          const response = await fetch(`${API_BASE_URL}${endpoints.transactions}/${id}/document`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(organizationId ? { 'X-Organization-Id': organizationId } : {})
            }
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to load document preview.');
          }

          const blob = await response.blob();
          setPreviewUrl(URL.createObjectURL(blob));
        } catch (error) {
          setPreviewError(error.message || 'Failed to load document preview.');
        } finally {
          setLoadingPreview(false);
        }
      }
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
      await patch(`${endpoints.transactions}/${id}`, editForm, authHeaders);
      setEditingId(null);
      // Bust namespace cache because edits change the list
      pageCache.bustNs('transactions');
      fetchTransactions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenGoogleSheets = async () => {
    if (!token || !organizationId) {
      setSheetError('Select an organization before opening Google Sheets.');
      return;
    }

    setSheetSyncing(true);
    setSheetError('');

    try {
      const result = await get(`${endpoints.transactionsGoogleSheets}?range=${sheetRange}`, authHeaders);
      setSheetInfo(result);
      window.open(result.selected_tab?.url || result.spreadsheet_url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setSheetError(error.message || 'Failed to open Google Sheets.');
    } finally {
      setSheetSyncing(false);
    }
  };

  return (
    <div className="premium-page-container">
      <style>
        {`
          .premium-page-container { padding: 0; }
          .premium-table-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
          .premium-table-title { font-size: 1.5rem; font-weight: 600; margin: 0; }
          .premium-controls { display: flex; gap: 12px; flex-wrap: wrap; }
          .premium-input, .premium-select { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
          .premium-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 16px; border-radius: 6px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 150ms ease; }
          .premium-btn:hover { background: var(--border); }
          .premium-btn:disabled { opacity: 0.6; cursor: not-allowed; }
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
          .premium-ghost-btn { background: transparent; border: none; color: var(--accent-blue); font-size: 0.85rem; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background 150ms ease, color 150ms ease; }
          .premium-ghost-btn:hover { background: rgba(59, 130, 246, 0.14); color:rgb(255, 255, 255); }
          .premium-ocr-panel { background: rgba(0,0,0,0.02); padding: 24px; border-bottom: 1px solid var(--border); }
          .dark .premium-ocr-panel { background: rgba(255,255,255,0.02); }
          .premium-ocr-grid { display: grid; gap: 12px; font-size: 0.85rem; }
          .premium-ocr-pre { background: var(--bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border); white-space: pre-wrap; font-family: monospace; color: var(--text-secondary); max-height: 200px; overflow-y: auto; }
          .premium-sheets-note { margin-bottom: 24px; padding: 16px 18px; border-radius: 12px; border: 1px solid rgba(15, 157, 88, 0.18); background: rgba(15, 157, 88, 0.06); display: grid; gap: 8px; }
          .premium-sheets-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0f9d58; }
          .premium-sheets-copy { margin: 0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; }
          .premium-sheets-status { margin: 0; color: var(--text-secondary); font-size: 0.85rem; }
          .premium-sheets-status.error { color: var(--accent-red); }
        `}
      </style>

      <div className="premium-table-header">
        <div>
          <h2 className="premium-table-title">Transactions</h2>
        </div>
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
          <select className="premium-select" value={sheetRange} onChange={e => setSheetRange(e.target.value)}>
            {GOOGLE_SHEET_WINDOWS.map((window) => (
              <option key={window.value} value={window.value}>
                Google Sheets {window.label}
              </option>
            ))}
          </select>
          <button className="premium-btn" type="button" onClick={handleOpenGoogleSheets} disabled={sheetSyncing || !organizationId}>
            {sheetSyncing ? 'Syncing Sheet...' : 'Sync & Open Google Sheets'}
          </button>
        </div>
      </div>

      <div className="premium-sheets-note">
        <span className="premium-sheets-label">Google Sheets View</span>
        <p className="premium-sheets-copy">
          Only the active organisation&apos;s transactions are exported into Google Sheets. The `1M`, `3M`, `6M`, and `12M` tabs are generated from your database, and edits inside Google Sheets do not update SPARK transactions.
        </p>
        {sheetError ? (
          <p className="premium-sheets-status error">{sheetError}</p>
        ) : sheetInfo?.selected_tab ? (
          <p className="premium-sheets-status">
            Last synced {sheetInfo.selected_tab.label} with {sheetInfo.selected_tab.row_count} transactions on {new Date(sheetInfo.synced_at).toLocaleString()}.
          </p>
        ) : (
          <p className="premium-sheets-status">Pick a time window, then sync and open the matching Google Sheets tab.</p>
        )}
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
                              <div className="premium-ocr-pre">
                                {expandedData.document?.extracted_text || expandedData.document?.text_content || 'No raw text available'}
                              </div>
                            </div>
                            <div style={{ marginTop: '12px' }}>
                              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Source Document
                              </span>
                              {loadingPreview ? (
                                <span style={{ color: 'var(--text-secondary)' }}>Loading document preview...</span>
                              ) : previewError ? (
                                <span style={{ color: 'var(--accent-red)' }}>{previewError}</span>
                              ) : previewUrl && expandedData.document?.file_type?.startsWith('image/') ? (
                                <img
                                  src={previewUrl}
                                  alt={expandedData.document?.original_name || 'Uploaded document'}
                                  style={{ maxWidth: '100%', maxHeight: '480px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                />
                              ) : previewUrl && expandedData.document?.file_type === 'application/pdf' ? (
                                <iframe
                                  src={previewUrl}
                                  title={expandedData.document?.original_name || 'Uploaded document'}
                                  style={{ width: '100%', height: '480px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}
                                />
                              ) : previewUrl ? (
                                <a
                                  href={previewUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="premium-ghost-btn"
                                  style={{ padding: 0 }}
                                >
                                  Open document
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>No document preview available</span>
                              )}
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
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Showing page {page} · {pageSize} rows</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="premium-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="premium-btn" disabled={transactions.length < pageSize} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
