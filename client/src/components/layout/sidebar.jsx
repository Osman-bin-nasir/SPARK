import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  const linkClass = ({ isActive }) =>
    `sidebar-link ${isActive ? 'is-active' : ''}`;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">SPARK</div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" className={linkClass}>Dashboard</NavLink>
        <NavLink to="/transactions" className={linkClass}>Transactions</NavLink>
        <NavLink to="/approvals" className={linkClass}>Approvals</NavLink>
        <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>
        <NavLink to="/finance" className={linkClass}>Finance</NavLink>
        <NavLink to="/team" className={linkClass}>Team</NavLink>
        <NavLink to="/integrations" className={linkClass}>Integrations</NavLink>
        <NavLink to="/settings" className={linkClass}>Settings</NavLink>
      </nav>
    </aside>
  );
}
