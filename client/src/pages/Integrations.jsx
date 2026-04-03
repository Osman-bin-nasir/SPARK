import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '../services/http';
import { endpoints } from '../services/endpoints';

function IntegrationsPage({ activeOrganizationId, onBack, onLogout, onSelectOrganization, token, user }) {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [driveStatus, setDriveStatus] = useState({ connected: false });

  const organizationId = activeOrganizationId || user?.default_organization_id || user?.organizations?.[0]?.id || '';
  const organizations = user?.organizations || [];
  const driveParam = searchParams.get('drive');
  const driveMessage = searchParams.get('message');

  useEffect(() => {
    if (!token || !organizationId) {
      setLoading(false);
      return;
    }

    let isActive = true;

    async function loadStatus() {
      try {
        setLoading(true);
        setError('');

        const result = await get(endpoints.googleDriveStatus, {
          token,
          headers: {
            'X-Organization-Id': organizationId
          }
        });

        if (!isActive) {
          return;
        }

        setDriveStatus(result);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setError(requestError.message);
      } finally {
        if (isActive) {
          setLoading(false);
        }
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
    <div className="card">
      <p className="eyebrow">Settings</p>
      <h1>Integrations</h1>
      <p className="card-subtitle">
        Connect organization storage so SPARK can place uploaded finance documents in Google Drive.
      </p>

      {driveParam === 'connected' && <p className="notice">Google Drive connected successfully.</p>}
      {driveParam === 'error' && <p className="error">{driveMessage || 'Google Drive connection failed.'}</p>}
      {error && <p className="error">{error}</p>}

      {organizations.length > 0 && (
        <label className="field">
          <span className="field-label">Active Organization</span>
          <select value={organizationId} onChange={(event) => onSelectOrganization(event.target.value)}>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="dashboard-grid">
        <div className="metric">
          <span className="metric-label">Google Drive</span>
          <strong>{loading ? 'Checking status...' : driveStatus.connected ? 'Connected' : 'Not connected'}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Account</span>
          <strong>{driveStatus.google_email || 'No Google account connected'}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Organization</span>
          <strong>{user?.organizations?.find((item) => item.id === organizationId)?.name || organizationId || 'Unavailable'}</strong>
        </div>
      </div>

      {!driveStatus.connected && (
        <button type="button" onClick={connectDrive} disabled={loading || !organizationId}>
          Connect Google Drive
        </button>
      )}

      <div className="actions-row">
        <button type="button" className="secondary-btn" onClick={onBack}>
          Back to Dashboard
        </button>
        <button type="button" className="secondary-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default IntegrationsPage;
