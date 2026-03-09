function DashboardPage({ user, token, onLogout, status }) {
  return (
    <div className="card">
      <h1>Dashboard</h1>
      {status && <p className="notice">{status}</p>}
      <p>Welcome, {user?.email || 'User'}</p>
      <p>Email: {user?.email || '-'}</p>
      <p>Telegram: {user?.telegram_id ? `Linked (${user.telegram_id})` : 'Not linked'}</p>
      <p>Token: {token ? 'Available' : 'Missing'}</p>
      <button onClick={onLogout}>Logout</button>
    </div>
  );
}

export default DashboardPage;
