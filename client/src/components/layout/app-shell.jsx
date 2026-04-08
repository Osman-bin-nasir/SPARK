import React from 'react';
import Sidebar from './sidebar';
import '../../styles/layout.css';

export default function AppShell({ 
  children, 
  user,
  activeOrganizationId,
  organizations,
  onSelectOrganization,
  onLogout,
  isDarkMode,
  toggleTheme
}) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" placeholder="Search..." />
            </div>
          </div>
          <div className="topbar-right">
            {organizations && organizations.length > 0 && (
              <select 
                style={{ height: '40px', padding: '0 12px', borderRadius: '6px', backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                value={activeOrganizationId} 
                onChange={(e) => onSelectOrganization && onSelectOrganization(e.target.value)}
              >
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            )}
            
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {isDarkMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              )}
            </button>
            <button className="icon-btn" onClick={onLogout} aria-label="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </header>
        <main className="content-wrapper">
          <div className="content-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
