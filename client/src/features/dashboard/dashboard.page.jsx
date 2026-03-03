function DashboardPage({ user, token, onLogout }) {
  return (
    <div className="card">
      <h1>Dashboard</h1>
      <p>Welcome, {user?.name || 'User'}</p>
      <p>Email: {user?.email || '-'}</p>
      <p>Token: {token ? 'Available' : 'Missing'}</p>
      <button onClick={onLogout}>Logout</button>
    </div>
  );
}

export default DashboardPage;
