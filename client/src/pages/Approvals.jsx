import { useEffect, useState } from 'react';
import { del, get, patch } from '../services/http';
import { API_BASE_URL, endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

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

function buildFormState(transaction) {
  return {
    vendor: transaction?.vendor || '',
    category: transaction?.category || '',
    amount: transaction?.amount === null || transaction?.amount === undefined ? '' : String(transaction.amount),
    transaction_date: transaction?.transaction_date ? String(transaction.transaction_date).slice(0, 10) : ''
  };
}

function getFormValidationMessage(form) {
  if (!form.vendor.trim()) {
    return 'Vendor is required.';
  }

  if (!form.category.trim()) {
    return 'Category is required.';
  }

  const amount = Number(form.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Amount must be a positive number.';
  }

  if (!form.transaction_date || Number.isNaN(Date.parse(form.transaction_date))) {
    return 'Transaction date must be valid.';
  }

  return '';
}

function buildTransactionPayload(form, transaction) {
  if (!transaction) {
    return {};
  }

  const payload = {};
  const nextVendor = form.vendor.trim();
  const nextCategory = form.category.trim();
  const nextDate = String(form.transaction_date || '').slice(0, 10);
  const currentDate = String(transaction.transaction_date || '').slice(0, 10);
  const nextAmount = Number(form.amount);
  const currentAmount = Number(transaction.amount);

  if (nextVendor && nextVendor !== transaction.vendor) {
    payload.vendor = nextVendor;
  }

  if (nextCategory && nextCategory !== transaction.category) {
    payload.category = nextCategory;
  }

  if (nextDate && nextDate !== currentDate) {
    payload.transaction_date = nextDate;
  }

  if (Number.isFinite(nextAmount) && Number.isFinite(currentAmount) && Number(nextAmount.toFixed(2)) !== Number(currentAmount.toFixed(2))) {
    payload.amount = nextAmount;
  }

  return payload;
}

export default function ApprovalsPage({ activeOrganizationId, token: tokenProp, user: userProp }) {
  const token = tokenProp || localStorage.getItem('token') || '';
  const user = userProp || JSON.parse(localStorage.getItem('user') || 'null');
  const organizationId = activeOrganizationId || resolveActiveOrganizationId(user);
  const authHeaders = {
    token,
    headers: organizationId ? { 'X-Organization-Id': organizationId } : {}
  };
  const approvalsCacheKey = organizationId || 'default';

  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(buildFormState(null));
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submittingAction, setSubmittingAction] = useState('');
  const [pageError, setPageError] = useState('');
  const [feedback, setFeedback] = useState({ tone: 'muted', text: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  useEffect(() => {
    if (currentIndex > pending.length - 1) {
      setCurrentIndex(Math.max(0, pending.length - 1));
    }
  }, [currentIndex, pending.length]);

  const fetchApprovals = async () => {
    if (!token || !organizationId) {
      setPending([]);
      setLoading(false);
      return;
    }

    const cached = pageCache.get('approvals', approvalsCacheKey);

    if (cached) {
      setPending(cached.data.items || []);
      setLoading(false);

      if (!pageCache.isStale('approvals', approvalsCacheKey)) {
        return;
      }
    }

    if (!cached) {
      setLoading(true);
    }

    setPageError('');

    try {
      const res = await get(`${endpoints.transactions}?status=pending_review`, authHeaders);
      pageCache.set('approvals', approvalsCacheKey, res);
      setPending(res.items || []);
    } catch (error) {
      if (!cached) {
        setPageError(error.message || 'Failed to load pending approvals.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentIndex(0);
    setDetail(null);
    setForm(buildFormState(null));
    setFeedback({ tone: 'muted', text: '' });
    fetchApprovals();
  }, [organizationId, token]);

  const tx = pending[currentIndex] || null;

  useEffect(() => {
    setToast(null);
  }, [tx?.id]);

  useEffect(() => {
    setFeedback({ tone: 'muted', text: '' });
    setForm(buildFormState(tx));
  }, [tx?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadTransactionDetail() {
      setDetail(null);
      setPreviewError('');
      setLoadingPreview(false);
      setPreviewUrl('');

      if (!tx || !token || !organizationId) {
        return;
      }

      try {
        const transaction = await get(`${endpoints.transactions}/${tx.id}`, authHeaders);

        if (cancelled) {
          return;
        }

        setDetail(transaction);

        if (!transaction.document || transaction.document.storage_kind === 'inline_text') {
          return;
        }

        setLoadingPreview(true);

        try {
          const response = await fetch(`${API_BASE_URL}${endpoints.transactions}/${tx.id}/document`, {
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
          const objectUrl = URL.createObjectURL(blob);

          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          setPreviewUrl(objectUrl);
        } catch (error) {
          if (!cancelled) {
            setPreviewError(error.message || 'Failed to load document preview.');
          }
        } finally {
          if (!cancelled) {
            setLoadingPreview(false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error.message || 'Failed to load transaction details.');
        }
      }
    }

    loadTransactionDetail();

    return () => {
      cancelled = true;
    };
  }, [tx?.id, organizationId, token]);

  const activeTransaction = detail || tx;
  const document = activeTransaction?.document || null;
  const confidence = Number(activeTransaction?.document?.extraction_confidence || activeTransaction?.confidence_score || 0.85);
  const strokeDash = 282 - (282 * confidence);
  const confidenceColor = confidence > 0.9 ? 'var(--accent-green)' : confidence > 0.7 ? '#eab308' : 'var(--accent-red)';
  const extractedText = document?.extracted_text || document?.text_content || '';

  const updatePendingTransaction = (updatedTransaction) => {
    setPending((items) => items.map((item) => (item.id === updatedTransaction.id ? { ...item, ...updatedTransaction } : item)));
  };

  const handleSaveChanges = async () => {
    if (!tx) {
      return;
    }

    const validationMessage = getFormValidationMessage(form);

    if (validationMessage) {
      setFeedback({ tone: 'error', text: validationMessage });
      return;
    }

    const payload = buildTransactionPayload(form, tx);

    if (!Object.keys(payload).length) {
      setFeedback({ tone: 'muted', text: 'No changes to save yet.' });
      return;
    }

    setSubmittingAction('save');
    setFeedback({ tone: 'muted', text: '' });

    try {
      const updatedTransaction = await patch(`${endpoints.transactions}/${tx.id}`, payload, authHeaders);
      updatePendingTransaction(updatedTransaction);
      setDetail(updatedTransaction);
      pageCache.bustNs('approvals');
      pageCache.bustNs('transactions');
      setFeedback({ tone: 'success', text: 'Changes saved. This receipt is still pending review.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message || 'Failed to save changes.' });
    } finally {
      setSubmittingAction('');
    }
  };

  const handleApprove = async () => {
    if (!tx) {
      return;
    }

    const validationMessage = getFormValidationMessage(form);

    if (validationMessage) {
      setFeedback({ tone: 'error', text: validationMessage });
      return;
    }

    const payload = {
      ...buildTransactionPayload(form, tx),
      status: 'approved'
    };

    setSubmittingAction('approve');
    setFeedback({ tone: 'muted', text: '' });

    try {
      await patch(`${endpoints.transactions}/${tx.id}`, payload, authHeaders);

      const nextPending = pending.filter((item) => item.id !== tx.id);
      setPending(nextPending);
      setDetail(null);
      pageCache.bustNs('approvals');
      pageCache.bustNs('transactions');
      setCurrentIndex((current) => Math.min(current, Math.max(0, nextPending.length - 1)));
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message || 'Failed to approve receipt.' });
    } finally {
      setSubmittingAction('');
    }
  };

  const confirmRemoveDuplicate = () => {
    if (!tx) {
      return;
    }

    setToast({
      tone: 'warning',
      title: 'Remove duplicate transaction?',
      message: 'This will delete the duplicate receipt from SPARK and cannot be undone.'
    });
  };

  const handleRemoveDuplicate = async () => {
    if (!tx) {
      return;
    }

    setSubmittingAction('remove_duplicate');
    setFeedback({ tone: 'muted', text: '' });
    setToast(null);

    try {
      await del(`${endpoints.transactions}/${tx.id}`, authHeaders);

      const nextPending = pending.filter((item) => item.id !== tx.id);
      setPending(nextPending);
      setDetail(null);
      pageCache.bustNs('approvals');
      pageCache.bustNs('transactions');
      setCurrentIndex((current) => Math.min(current, Math.max(0, nextPending.length - 1)));
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message || 'Failed to remove duplicate transaction.' });
    } finally {
      setSubmittingAction('');
    }
  };

  if (!token) {
    return (
      <div className="premium-page-container" style={{ padding: '40px' }}>
        <h2 style={{ margin: 0 }}>Sign in to review receipts.</h2>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="premium-page-container" style={{ padding: '40px' }}>
        <h2 style={{ margin: 0 }}>Select an organization to review receipts.</h2>
      </div>
    );
  }

  if (loading && pending.length === 0) {
    return <div className="premium-page-container" style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading pending approvals...</div>;
  }

  if (!loading && pageError && pending.length === 0) {
    return (
      <div className="premium-page-container" style={{ padding: '40px' }}>
        <h2 style={{ margin: 0 }}>Approval queue unavailable</h2>
        <p style={{ color: 'var(--accent-red)' }}>{pageError}</p>
      </div>
    );
  }

  if (!loading && pending.length === 0) {
    return (
      <div className="premium-page-container" style={{ padding: '40px' }}>
        <h2 style={{ margin: 0 }}>Inbox Zero!</h2>
        <p style={{ color: 'var(--text-secondary)' }}>No receipts pending review.</p>
      </div>
    );
  }

  if (!activeTransaction) {
    return null;
  }

  return (
    <div className="premium-page-container" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>
        {`
          .approval-toast-stack { position: fixed; top: 24px; right: 24px; z-index: 40; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
          .approval-toast { width: min(360px, calc(100vw - 32px)); background: rgba(12, 18, 24, 0.96); border: 1px solid rgba(234, 179, 8, 0.24); border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); padding: 16px; display: grid; gap: 10px; pointer-events: auto; backdrop-filter: blur(16px); }
          .approval-toast-title { margin: 0; color: #f8fafc; font-size: 0.98rem; font-weight: 700; }
          .approval-toast-copy { margin: 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; }
          .approval-toast-actions { display: flex; justify-content: flex-end; gap: 10px; }
          .approval-toast-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid transparent; font-size: 0.88rem; font-weight: 600; line-height: 1.2; cursor: pointer; transition: all 150ms ease; }
          .approval-toast-btn.cancel { background: transparent; color: #cbd5e1; border-color: rgba(148, 163, 184, 0.2); }
          .approval-toast-btn.cancel:hover { background: rgba(148, 163, 184, 0.08); }
          .approval-toast-btn.confirm { background: rgba(239, 68, 68, 0.16); color: #fecaca; border-color: rgba(239, 68, 68, 0.28); }
          .approval-toast-btn.confirm:hover { background: rgba(239, 68, 68, 0.22); }
          .approvals-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
          .approvals-title { font-size: 1.5rem; font-weight: 600; margin: 0; }
          .approvals-subtitle { margin: 6px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
          .approvals-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 32px; flex: 1; min-height: 0; }
          .approvals-left { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; position: relative; min-height: 560px; }
          .document-preview { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.02); padding: 20px; }
          .dark .document-preview { background: rgba(255,255,255,0.02); }
          .document-preview img, .document-preview iframe { width: 100%; height: 100%; border: none; border-radius: 10px; }
          .document-preview-text { width: 100%; height: 100%; overflow: auto; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); padding: 20px; white-space: pre-wrap; font-family: monospace; color: var(--text-secondary); }
          .document-preview-empty { display: grid; gap: 10px; justify-items: center; text-align: center; color: var(--text-secondary); }
          .approvals-right { display: flex; flex-direction: column; gap: 24px; }
          .ocr-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 32px; position: relative; }
          .ocr-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; gap: 20px; }
          .ocr-top-info h3 { margin: 0; font-size: 1.8rem; font-weight: 700; }
          .ocr-top-info p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.95rem; }
          .review-chip { margin-top: 12px; display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: rgba(234, 179, 8, 0.1); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.2); }
          .confidence-ring { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
          .confidence-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; }
          .ocr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .ocr-field { display: flex; flex-direction: column; gap: 6px; }
          .ocr-field label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); font-weight: 600; }
          .ocr-field input { background: transparent; border: 1px solid var(--border); color: var(--text-primary); padding: 10px 14px; border-radius: 8px; font-size: 1rem; font-weight: 500; transition: border-color 150ms ease; }
          .ocr-field input:focus { border-color: var(--accent-blue); outline: none; }
          .audit-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; flex: 1; display: flex; flex-direction: column; gap: 18px; }
          .audit-card h4 { margin: 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
          .review-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }
          .review-meta-item { display: grid; gap: 4px; }
          .review-meta-item span { color: var(--text-secondary); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
          .review-meta-item strong { font-size: 0.95rem; }
          .ocr-text-block { margin: 0; max-height: 180px; overflow: auto; border: 1px solid var(--border); border-radius: 10px; background: rgba(0,0,0,0.02); padding: 14px; color: var(--text-secondary); white-space: pre-wrap; font-family: monospace; font-size: 0.84rem; }
          .dark .ocr-text-block { background: rgba(255,255,255,0.02); }
          .feedback-banner { border-radius: 10px; padding: 12px 14px; font-size: 0.9rem; }
          .feedback-banner.success { background: rgba(34, 197, 94, 0.12); color: var(--accent-green); border: 1px solid rgba(34, 197, 94, 0.18); }
          .feedback-banner.error { background: rgba(239, 68, 68, 0.12); color: var(--accent-red); border: 1px solid rgba(239, 68, 68, 0.18); }
          .feedback-banner.muted { background: rgba(148, 163, 184, 0.08); color: var(--text-secondary); border: 1px solid var(--border); }
          .duplicate-actions { display: flex; justify-content: flex-start; }
          .btn-danger,
          .btn-secondary,
          .btn-approve {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            line-height: 1.2;
            min-height: 56px;
            padding: 0 16px;
            box-sizing: border-box;
            width: 100%;
          }
          .btn-danger { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; border-radius: 8px; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: all 150ms ease; }
          .btn-danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.16); border-color: rgba(239, 68, 68, 0.35); color: #fecaca; }
          .approvals-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: auto; }
          .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text-primary); border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 150ms ease; }
          .btn-secondary:hover:not(:disabled) { background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.25); }
          .btn-approve { background: linear-gradient(135deg, var(--accent-blue), #60a5fa); border: none; color: #fff; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 150ms ease, box-shadow 150ms ease; box-shadow: var(--glow-shadow); }
          .btn-approve:hover:not(:disabled) { transform: scale(0.98); box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3); }
          .btn-secondary:disabled, .btn-approve:disabled, .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
          .pagination-controls { display: flex; gap: 8px; align-items: center; }
          .page-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-primary); width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
          .page-btn:hover:not(:disabled) { background: var(--border); }
          .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          @media (max-width: 1024px) {
            .approvals-layout { grid-template-columns: 1fr; }
            .approvals-left { min-height: 360px; }
          }
          @media (max-width: 640px) {
            .approval-toast-stack { top: auto; right: 16px; bottom: 16px; left: 16px; }
            .approval-toast { width: 100%; }
            .ocr-grid, .review-meta, .approvals-actions { grid-template-columns: 1fr; }
            .ocr-card { padding: 24px; }
          }
        `}
      </style>

      {toast ? (
        <div className="approval-toast-stack" role="status" aria-live="polite">
          <div className="approval-toast">
            <p className="approval-toast-title">{toast.title}</p>
            <p className="approval-toast-copy">{toast.message}</p>
            <div className="approval-toast-actions">
              <button className="approval-toast-btn cancel" type="button" onClick={() => setToast(null)}>
                Cancel
              </button>
              <button className="approval-toast-btn confirm" type="button" onClick={handleRemoveDuplicate}>
                {submittingAction === 'remove_duplicate' ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="approvals-header">
        <div>
          <h2 className="approvals-title">Pending Approvals <span>({pending.length})</span></h2>
          <p className="approvals-subtitle">Review the extracted fields, save corrections if needed, then approve the transaction.</p>
        </div>
        <div className="pagination-controls">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '8px' }}>{currentIndex + 1} of {pending.length}</span>
          <button className="page-btn" disabled={currentIndex === 0} onClick={() => setCurrentIndex(currentIndex - 1)}>&lt;</button>
          <button className="page-btn" disabled={currentIndex === pending.length - 1} onClick={() => setCurrentIndex(currentIndex + 1)}>&gt;</button>
        </div>
      </div>

      <div className="approvals-layout">
        <div className="approvals-left">
          <div className="document-preview">
            {loadingPreview ? (
              <div className="document-preview-empty">
                <span>Loading receipt preview...</span>
              </div>
            ) : document?.storage_kind === 'inline_text' ? (
              <pre className="document-preview-text">{extractedText || 'No extracted text available.'}</pre>
            ) : previewError ? (
              <div className="document-preview-empty">
                <span style={{ color: 'var(--accent-red)' }}>{previewError}</span>
              </div>
            ) : previewUrl && document?.file_type?.startsWith('image/') ? (
              <img src={previewUrl} alt={document?.original_name || 'Uploaded receipt'} />
            ) : previewUrl && document?.file_type === 'application/pdf' ? (
              <iframe src={previewUrl} title={document?.original_name || 'Uploaded receipt'} />
            ) : previewUrl ? (
              <div className="document-preview-empty">
                <a href={previewUrl} target="_blank" rel="noreferrer">Open document</a>
              </div>
            ) : (
              <div className="document-preview-empty">
                <span>No document preview available.</span>
                <span style={{ fontSize: '0.78rem' }}>{document?.original_name || document?.stored_name || 'Document not attached'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="approvals-right">
          <div className="ocr-card">
            <div className="ocr-header">
              <div className="ocr-top-info">
                <h3>${Number(activeTransaction.amount).toFixed(2)}</h3>
                <p>{activeTransaction.vendor}</p>
                <span className="review-chip">Pending Review</span>
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
                <input type="text" value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Date</label>
                <input type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Amount</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </div>
              <div className="ocr-field">
                <label>Category</label>
                <input type="text" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </div>
            </div>
          </div>

          <div className="audit-card">
            <h4>Review Context</h4>

            <div className="review-meta">
              <div className="review-meta-item">
                <span>Submitted</span>
                <strong>{new Date(activeTransaction.created_at).toLocaleString()}</strong>
              </div>
              <div className="review-meta-item">
                <span>Document</span>
                <strong>{document?.original_name || document?.stored_name || 'No attachment'}</strong>
              </div>
              <div className="review-meta-item">
                <span>Duplicate Check</span>
                <strong>{activeTransaction.duplicate_score > 0.8 ? `Possible duplicate (${Math.round(activeTransaction.duplicate_score * 100)}%)` : 'No duplicate flagged'}</strong>
              </div>
              <div className="review-meta-item">
                <span>Review Outcome</span>
                <strong>Approving will mark this transaction as Approved.</strong>
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '12px' }}>Extracted Text</h4>
              <pre className="ocr-text-block">{extractedText || 'No extracted text available for this document yet.'}</pre>
            </div>

            {feedback.text ? (
              <div className={`feedback-banner ${feedback.tone}`}>
                {feedback.text}
              </div>
            ) : null}

            {activeTransaction.duplicate_score > 0.8 ? (
              <div className="duplicate-actions">
                <button className="btn-danger" disabled={submittingAction !== ''} onClick={confirmRemoveDuplicate}>
                  Remove Duplicate
                </button>
              </div>
            ) : null}

            <div className="approvals-actions">
              <button className="btn-secondary" disabled={submittingAction !== ''} onClick={handleSaveChanges}>
                {submittingAction === 'save' ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn-approve" disabled={submittingAction !== ''} onClick={handleApprove}>
                {submittingAction === 'approve' ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
