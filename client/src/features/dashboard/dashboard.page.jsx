function DashboardPage({ user, token, onLogout, onOpenIntegrations, status }) {
  return (
    <div className="card">
      <p className="eyebrow">SPARK Console</p>
      <h1>Dashboard</h1>
      <p className="card-subtitle">
        Identity status for your finance workspace and Telegram ingestion link.
      </p>
      {status && <p className="notice">{status}</p>}
      <div className="dashboard-grid">
        <div className="metric">
          <span className="metric-label">Account</span>
          <strong>{user?.email || 'User'}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Telegram</span>
          <strong>{user?.telegram_id ? `Linked · ${user.telegram_id}` : 'Not linked'}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Session</span>
          <strong>{token ? 'Active' : 'Missing'}</strong>
        </div>
      </div>
      <div className="actions-row">
        <button className="secondary-btn" onClick={onOpenIntegrations}>Settings · Integrations</button>
        <button className="secondary-btn" onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}

export default DashboardPage;
