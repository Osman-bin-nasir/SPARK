import { useState, useEffect } from 'react';
import { get, patch } from '../services/http';
import { endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

export default function ApprovalsPage() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [formData, setFormData] = useState({});

  const fetchApprovals = async () => {
    const cached = pageCache.get('approvals', 'pending');
    if (cached) {
      setPending(cached.data.items || []);
      setLoading(false);
      if (!pageCache.isStale('approvals', 'pending')) return;
    }

    if (!cached) setLoading(true);
    try {
      const res = await get(`${endpoints.transactions}?status=pending_review`);
      pageCache.set('approvals', 'pending', res);
      if (res.items) setPending(res.items);
    } catch (e) {
      if (!cached) console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  useEffect(() => {
    const tx = pending[currentIndex];
    if (tx) {
      setFormData({
        vendor: tx.vendor || '',
        transaction_date: tx.transaction_date ? tx.transaction_date.slice(0, 10) : '',
        amount: tx.amount ? Number(tx.amount).toFixed(2) : '',
        category: tx.category || ''
      });
    }
  }, [pending, currentIndex]);

  const handleAction = async (id, newStatus) => {
    try {
      const payload = { status: newStatus };
      if (newStatus === 'verified') {
        if (formData.vendor !== pending[currentIndex].vendor) payload.vendor = formData.vendor;
        if (formData.category !== pending[currentIndex].category) payload.category = formData.category;
        
        let cleanedAmount = String(formData.amount).replace(/[^0-9.]/g, '');
        if (cleanedAmount && Number(cleanedAmount) !== Number(pending[currentIndex].amount)) payload.amount = cleanedAmount;
        
        if (formData.transaction_date && formData.transaction_date !== pending[currentIndex].transaction_date?.slice(0, 10)) {
          payload.transaction_date = formData.transaction_date;
        }
      }

      await patch(`${endpoints.transactions}/${id}`, payload);
      const newPending = pending.filter(t => t.id !== id);
      setPending(newPending);
      
      const cached = pageCache.get('approvals', 'pending');
      if (cached) pageCache.set('approvals', 'pending', { ...cached.data, items: newPending });
      
      if (currentIndex >= newPending.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && pending.length === 0) return <div className="premium-page-container" style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading pending approvals...</div>;
  if (!loading && pending.length === 0) return <div className="premium-page-container" style={{ padding: '40px' }}><h2 style={{margin:0}}>Inbox Zero!</h2><p style={{color: 'var(--text-secondary)'}}>No receipts pending review.</p></div>;

  const tx = pending[currentIndex];
  if (!tx) return null;

  const confidence = Number(tx.confidence_score || 0.85);
  const strokeDash = 282 - (282 * confidence);
  const confidenceColor = confidence > 0.9 ? 'var(--accent-green)' : confidence > 0.7 ? '#eab308' : 'var(--accent-red)';

  return (
    <div className="premium-page-container" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>
         {`
           .approvals-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
           .approvals-title { font-size: 1.5rem; font-weight: 600; margin: 0; }
           .approvals-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 32px; flex: 1; min-height: 0; }
           .approvals-left { background: var(--card); border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
           .receipt-mock { width: 100%; height: 100%; object-fit: contain; padding: 24px; background: rgba(0,0,0,0.02); }
           .dark .receipt-mock { background: rgba(255,255,255,0.02); }
           .approvals-right { display: flex; flex-direction: column; gap: 24px; }
           .ocr-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 32px; position: relative; }
           .ocr-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
           .ocr-top-info h3 { margin: 0; font-size: 1.8rem; font-weight: 700; }
           .ocr-top-info p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
           .confidence-ring { position: relative; width: 64px; height: 64px; }
           .confidence-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; }
           .ocr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
           .ocr-field { display: flex; flex-direction: column; gap: 6px; }
           .ocr-field label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); font-weight: 600; }
           .ocr-field input { background: transparent; border: 1px solid var(--border); color: var(--text-primary); padding: 10px 14px; border-radius: 8px; font-size: 1rem; font-weight: 500; transition: border-color 150ms ease; }
           .ocr-field input:focus { border-color: var(--accent-blue); outline: none; }
           .audit-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; flex: 1; }
           .audit-card h4 { margin: 0 0 16px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
           .audit-timeline { display: flex; flex-direction: column; gap: 16px; position: relative; }
           .audit-timeline::before { content: ''; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 2px; background: var(--border); }
           .audit-item { display: flex; gap: 16px; position: relative; z-index: 1; }
           .audit-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--card); border: 2px solid var(--accent-blue); margin-top: 4px; }
           .audit-item-content h5 { margin: 0; font-size: 0.9rem; font-weight: 500; }
           .audit-item-content p { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
           .approvals-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: auto; }
           .btn-reject { background: transparent; border: 1px solid var(--border); color: var(--text-primary); padding: 16px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 150ms ease; }
           .btn-reject:hover { background: rgba(239, 68, 68, 0.05); color: var(--accent-red); border-color: rgba(239, 68, 68, 0.3); }
           .btn-approve { background: linear-gradient(135deg, var(--accent-blue), #60a5fa); border: none; color: #fff; padding: 16px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 150ms ease, box-shadow 150ms ease; box-shadow: var(--glow-shadow); }
           .btn-approve:hover { transform: scale(0.98); box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3); }
           .pagination-controls { display: flex; gap: 8px; align-items: center; }
           .page-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
           .page-btn:hover:not(:disabled) { background: var(--border); }
           .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
         `}
      </style>

      <div className="approvals-header">
        <h2 className="approvals-title">Pending Approvals <span>({pending.length})</span></h2>
        <div className="pagination-controls">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '8px' }}>{currentIndex + 1} of {pending.length}</span>
          <button className="page-btn" disabled={currentIndex === 0} onClick={() => setCurrentIndex(currentIndex - 1)}>&lt;</button>
          <button className="page-btn" disabled={currentIndex === pending.length - 1} onClick={() => setCurrentIndex(currentIndex + 1)}>&gt;</button>
        </div>
      </div>

      <div className="approvals-layout">
        <div className="approvals-left">
           {/* We use a placeholder matching the premium aesthetic for the receipt */}
           <div className="receipt-mock">
              <div style={{ width: '100%', height: '100%', border: '2px dashed var(--border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: '16px', opacity: 0.5 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Waiting for signed S3 URL...</span>
                <span style={{ fontSize: '10px', marginTop: '8px' }}>Document ID: {tx.document?.id || 'doc_placeholder'}</span>
              </div>
           </div>
        </div>

        <div className="approvals-right">
          <div className="ocr-card">
            <div className="ocr-header">
              <div className="ocr-top-info">
                <h3>${Number(tx.amount).toFixed(2)}</h3>
                <p>{tx.vendor}</p>
              </div>
              <div className="confidence-ring">
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke={confidenceColor} strokeWidth="8" strokeDasharray="282" strokeDashoffset={strokeDash} style={{ transition: 'stroke-dashoffset 1s ease' }} />
                </svg>
                <div className="confidence-text" style={{ color: confidenceColor }}>
                  {Number(confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="ocr-grid">
              <div className="ocr-field">
                <label>Merchant</label>
                <input type="text" value={formData.vendor || ''} onChange={e => setFormData({ ...formData, vendor: e.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Date</label>
                <input type="date" value={formData.transaction_date || ''} onChange={e => setFormData({ ...formData, transaction_date: e.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Amount</label>
                <input type="text" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Category</label>
                <input type="text" value={formData.category || ''} onChange={e => setFormData({ ...formData, category: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="audit-card">
            <h4>Audit Trail</h4>
            <div className="audit-timeline">
              <div className="audit-item">
                <div className="audit-dot"></div>
                <div className="audit-item-content">
                  <h5>Transaction Synced</h5>
                  <p>Inbound webhook via Plaid</p>
                </div>
              </div>
              <div className="audit-item">
                <div className="audit-dot" style={{ borderColor: 'var(--accent-purple)' }}></div>
                <div className="audit-item-content">
                  <h5>AI Classification</h5>
                  <p>Assigned to {tx.category} with {Number(confidence * 100).toFixed(0)}% confidence</p>
                </div>
              </div>
              {tx.duplicate_score > 0.8 && (
                <div className="audit-item">
                  <div className="audit-dot" style={{ borderColor: 'var(--accent-red)' }}></div>
                  <div className="audit-item-content">
                    <h5 style={{ color: 'var(--accent-red)'}}>Duplicate Flag</h5>
                    <p>Matches transaction {tx.duplicate_of_transaction_id.substring(0,8)}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="approvals-actions" style={{ marginTop: '32px' }}>
              <button className="btn-reject" onClick={() => handleAction(tx.id, 'rejected')}>Needs Correction</button>
              <button className="btn-approve" onClick={() => handleAction(tx.id, 'verified')}>Approve & Verify</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
