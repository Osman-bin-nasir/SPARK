import { useState } from 'react';

export default function SettingsPage() {
  return (
    <div className="premium-page-container">
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.5rem', margin: '0 0 8px 0' }}>Settings</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage your personal account preferences.</p>
      </div>
      <div className="premium-card" style={{ maxWidth: '600px' }}>
        <div className="premium-card-header">
          <h3 className="premium-card-title">Profile</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>First Name</label>
              <input className="premium-input" type="text" defaultValue="Demo" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Last Name</label>
              <input className="premium-input" type="text" defaultValue="User" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
             <label style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Email Address</label>
             <input className="premium-input" type="text" defaultValue="demo1@gmail.com" disabled style={{ width: '100%', opacity: 0.7 }} />
             <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Contact support to change your email address.</p>
          </div>
          <div>
             <label style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Role</label>
             <input className="premium-input" type="text" defaultValue="Founder / Admin" disabled style={{ width: '100%', opacity: 0.7 }} />
          </div>
        </div>
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="primary-btn">Save Changes</button>
        </div>
      </div>

      <div className="premium-card" style={{ maxWidth: '800px', marginTop: '24px' }}>
        <div className="premium-card-header">
          <h3 className="premium-card-title">Notifications & Preferences</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div>
               <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>Email Notifications</h4>
               <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Receive daily summaries of your account activity.</p>
             </div>
             <label className="toggle-switch">
               <input type="checkbox" defaultChecked />
               <span className="slider"></span>
             </label>
          </div>
          
          <div style={{ height: '1px', background: 'var(--border)' }}></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div>
               <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>Unusual Spend Alerts</h4>
               <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Get notified when a transaction exceeds historical norms.</p>
             </div>
             <label className="toggle-switch">
               <input type="checkbox" defaultChecked />
               <span className="slider"></span>
             </label>
          </div>

          <div style={{ height: '1px', background: 'var(--border)' }}></div>

          <div>
             <label style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Theme Preference</label>
             <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>The dark mode/light mode toggle is available in the top navigation bar globally.</p>
          </div>
        </div>
      </div>

      <div className="premium-card" style={{ maxWidth: '800px', marginTop: '24px' }}>
        <div className="premium-card-header">
          <h3 className="premium-card-title">Security & Danger Zone</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
           <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>You must confirm your current password to execute sensitive actions.</p>
        </div>
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
           <button style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 16px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}>Delete Account</button>
        </div>
      </div>
    </div>
  );
}
