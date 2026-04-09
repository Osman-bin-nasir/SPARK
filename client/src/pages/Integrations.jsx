import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '../services/http';
import { endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';
import '../styles/dashboard.css';

function StatusBadge({ icon, loading, connected, hoverText }) {
  let color = '#df3312'; // red
  let text = 'Not connected';
  let isSpinning = false;

  if (loading) {
    color = '#fca130';
    text = 'Checking status...';
    isSpinning = true;
  } else if (connected) {
    color = '#037f0c';
    text = 'Connected';
  }

  if (hoverText && !loading) {
    text = hoverText;
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} title={text}>
      {icon}
      <div style={{
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: color,
        border: '2px solid #ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
      }}>
        {isSpinning && (
          <svg style={{ animation: 'spark-spin 1s linear infinite' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        )}
      </div>
    </div>
  );
}

function IntegrationsPage({ activeOrganizationId, onBack, onLogout, onSelectOrganization, token, user }) {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [driveStatus, setDriveStatus] = useState({ connected: false });

  const organizationId = activeOrganizationId || user?.default_organization_id || user?.organizations?.[0]?.id || '';
  const organizations = user?.organizations || [];
  const organization = organizations.find((o) => o.id === organizationId);
  const driveParam = searchParams.get('drive');
  const driveMessage = searchParams.get('message');

  useEffect(() => {
    if (!token || !organizationId) {
      setLoading(false);
      return;
    }

    let isActive = true;
    const cached = pageCache.get('integrations_drive', organizationId);

    if (cached) {
      setDriveStatus(cached.data);
      setLoading(false);
      if (!pageCache.isStale('integrations_drive', organizationId)) return;
    }

    async function loadStatus() {
      try {
        if (!cached) setLoading(true);
        setError('');

        const result = await get(endpoints.googleDriveStatus, {
          token,
          headers: {
            'X-Organization-Id': organizationId
          }
        });

        if (!isActive) return;

        pageCache.set('integrations_drive', organizationId, result);
        setDriveStatus(result);
      } catch (requestError) {
        if (!isActive) return;
        if (!cached) setError(requestError.message);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadStatus();

    return () => {
      isActive = false;
    };
  }, [organizationId, token]);

  async function connectDrive() {
    if (!organizationId) {
      setError('No organization is selected for this account.');
      return;
    }

    try {
      setError('');
      const result = await post(
        endpoints.googleDriveConnectUrl,
        {},
        {
          token,
          headers: {
            'X-Organization-Id': organizationId
          }
        }
      );

      if (!result.url) {
        throw new Error('Google Drive connect URL is missing');
      }

      window.location.href = result.url;
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="premium-page-container">
      <style>{`
        @keyframes spark-spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: '0 0 8px 0' }}>Connected Services</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Manage third-party integrations, storage connections, and AI modules for{' '}
            <strong>{organization?.name || organizationId}</strong>.
          </p>
        </div>
      </div>

      {driveParam === 'connected' && <p className="notice" style={{ marginBottom: '24px' }}>Google Drive connected successfully.</p>}
      {driveParam === 'error' && <p className="error" style={{ marginBottom: '24px' }}>{driveMessage || 'Google Drive connection failed.'}</p>}
      {error && <p className="error" style={{ marginBottom: '24px' }}>{error}</p>}

      {/* 2-column grid — all 4 cards, equal width & equal height per row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', alignItems: 'start' }}>

        {/* Google Drive */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <StatusBadge loading={loading} connected={driveStatus.connected}
                icon={<svg width="40" height="40" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>}
              />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>Google Drive</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Connect your organization's Google Drive to automatically store uploaded finance documents and generate reports.
            </p>
          </div>
          <div style={{ padding: '16px 24px', flex: 1 }}>
            {driveStatus.connected ? (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Connected Account</div>
                <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{driveStatus.google_email || 'No email available'}</div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Not connected. Click below to authorize.</p>
            )}
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
            {!driveStatus.connected ? (
              <button type="button" onClick={connectDrive} disabled={loading || !organizationId} style={{ width: '100%' }}>
                Connect Google Drive
              </button>
            ) : (
              <button type="button" className="secondary-btn" disabled style={{ width: '100%' }}>
                Service Linked
              </button>
            )}
          </div>
        </div>

        {/* Telegram */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <StatusBadge loading={false} connected={true} hoverText="Active System-wide"
                icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#2AABEE"/><path fill="#fff" d="M5.4 11.8l11.4-4.4c.5-.2.9.1.8.6l-1.9 9.1c-.1.5-.4.7-.8.4l-2.3-1.7-1.1 1.1c-.1.1-.3.2-.5.2l.2-2.4 4.3-3.9c.2-.2-.1-.3-.3-.1l-5.3 3.3-2.3-.7c-.5-.2-.5-.5.1-.7z"/></svg>}
              />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>Telegram Bot</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Get instant alerts, submit expenses via chat, and query your startup's financial metrics directly from Telegram.
            </p>
          </div>
          <div style={{ padding: '16px 24px', flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Join Link</div>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>Retrieve invite link from the Team page</div>
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
            <button type="button" className="secondary-btn" onClick={onBack} style={{ width: '100%' }}>
              View on Dashboard
            </button>
          </div>
        </div>

        {/* Google Sheets */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <StatusBadge loading={loading} connected={driveStatus.connected} hoverText={driveStatus.connected ? 'Ready in Transactions' : 'Needs Google Drive'}
                icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path fill="#0F9D58" d="M14.5 2H5C4.4 2 4 2.4 4 3v18c0 .6.4 1 1 1h14c.6 0 1-.4 1-1V7.5L14.5 2z"/><path fill="#000" fillOpacity=".2" d="M14.5 8h5.5l-5.5-6v6z"/><path fill="#fff" d="M8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h5v2H8V8z"/></svg>}
              />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>Google Sheets Sync</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Export organisation-specific transaction views into Google Sheets with dedicated `1M`, `3M`, `6M`, and `12M` tabs for high-volume browsing.
            </p>
          </div>
          <div style={{ padding: '16px 24px', flex: 1 }}>
            {driveStatus.connected ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Google Sheets is available from the Transactions page. Sheet edits stay in Sheets only and do not update database transactions.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Connect Google Drive first so SPARK can create and sync the organisation&apos;s Google Sheet.
              </p>
            )}
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
            {!driveStatus.connected ? (
              <button type="button" onClick={connectDrive} disabled={loading || !organizationId} style={{ width: '100%' }}>
                Connect to Enable Sheets
              </button>
            ) : (
              <button type="button" className="secondary-btn" disabled style={{ width: '100%' }}>
                Open from Transactions
              </button>
            )}
          </div>
        </div>

        {/* AI Services */}
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <StatusBadge loading={false} connected={true} hoverText="System Active"
                icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
              />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>AI Services (LLM & OCR)</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Power the financial insight assistant and automated receipt OCR capabilities with advanced AI processing.
            </p>
          </div>
          <div style={{ padding: '16px 24px', flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Capabilities</div>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem' }}>Receipt parsing · Financial assistant</div>
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
            <button type="button" className="secondary-btn" disabled style={{ width: '100%' }}>
              System Managed
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
export default IntegrationsPage;
