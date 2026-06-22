import { useState, useEffect, useCallback } from 'react';
import { get, post, del, patch } from '../services/http';
import { endpoints } from '../services/endpoints';
import { pageCache } from '../services/page-cache';

const ROLES = ['member', 'admin', 'founder'];

const ROLE_COLORS = {
  founder: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' },
  admin:   { bg: 'rgba(59, 130, 246, 0.12)',  text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  member:  { bg: 'rgba(100, 116, 139, 0.1)',  text: 'var(--text-secondary)', border: 'rgba(100,116,139,0.2)' },
};

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.member;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'capitalize',
      letterSpacing: '0.03em',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
    }}>
      {role}
    </span>
  );
}

function getInitials(email = '') {
  return email.slice(0, 2).toUpperCase();
}

function Avatar({ email }) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#0ea5e9', '#10b981'];
  const idx = email.charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: colors[idx],
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.8rem',
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {getInitials(email)}
    </div>
  );
}

export default function TeamPage() {
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const organizationId = user?.organizations?.[0]?.id || '';
  const myRole = user?.organizations?.find(o => o.id === organizationId)?.role || 'member';
  const isFounder = myRole === 'founder';

  const [members, setMembers] = useState([]);
  const [orgInfo, setOrgInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Add member form
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Inline role change state: { [userId]: newRole }
  const [pendingRoles, setPendingRoles] = useState({});
  const [savingRole, setSavingRole] = useState('');

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [deleting, setDeleting] = useState('');

  const authHeaders = { token, headers: { 'X-Organization-Id': organizationId } };

  const fetchTeam = useCallback(async () => {
    if (!token || !organizationId) { setLoading(false); return; }
    
    // Serve from cache immediately if present
    const cached = pageCache.get('team', organizationId);
    if (cached) {
      setMembers(cached.data.members || []);
      setOrgInfo(cached.data.organization || null);
      setLoading(false);
      if (!pageCache.isStale('team', organizationId)) return;
    }

    try {
      if (!cached) setLoading(true);
      setError('');
      const result = await get(endpoints.organizationsTeam, authHeaders);
      
      pageCache.set('team', organizationId, result);
      setMembers(result.members || []);
      setOrgInfo(result.organization || null);
    } catch (err) {
      if (!cached) setError(err.message || 'Failed to load team.');
    } finally {
      setLoading(false);
    }
  }, [token, organizationId]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  async function handleAddMember(e) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddError('');
    setNotice('');
    try {
      await post(
        endpoints.organizationsTeamMembers,
        { email: addEmail.trim().toLowerCase(), role: addRole },
        authHeaders
      );
      setAddEmail('');
      setAddRole('member');
      setNotice(`${addEmail.trim()} added to the team.`);
      pageCache.bust('team', organizationId);
      fetchTeam();
    } catch (err) {
      setAddError(err.message || 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(userId, email) {
    setDeleting(userId);
    setNotice('');
    try {
      await del(`${endpoints.organizationsTeamMembers}/${userId}`, authHeaders);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      setConfirmDeleteId('');
      setNotice(`${email} has been removed.`);
      // Update cache optimistically
      const cached = pageCache.get('team', organizationId);
      if (cached) pageCache.set('team', organizationId, { ...cached.data, members: cached.data.members.filter(m => m.user_id !== userId) });
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    } finally {
      setDeleting('');
    }
  }

  async function handleUpdateRole(userId, email) {
    const newRole = pendingRoles[userId];
    if (!newRole) return;
    setSavingRole(userId);
    setNotice('');
    try {
      await patch(
        `${endpoints.organizationsTeamMembers}/${userId}/role`,
        { role: newRole },
        authHeaders
      );
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
      setPendingRoles(prev => { const next = { ...prev }; delete next[userId]; return next; });
      setNotice(`${email}'s role updated to ${newRole}.`);
      // Update cache optimistically
      const cached = pageCache.get('team', organizationId);
      if (cached) pageCache.set('team', organizationId, { ...cached.data, members: cached.data.members.map(m => m.user_id === userId ? { ...m, role: newRole } : m) });
    } catch (err) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setSavingRole('');
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
  };

  return (
    <div className="premium-page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 6px 0' }}>Team Management</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            {orgInfo?.name || 'Your Organization'} · {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        {orgInfo?.join_link && (
          <a
            href={orgInfo.join_link}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
              background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)',
              textDecoration: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Telegram Invite Link
          </a>
        )}
      </div>

      {/* Notices */}
      {notice && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '0.875rem' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Add Member Card — founder only */}
      {isFounder && (
        <div className="premium-card" style={{ marginBottom: '24px' }}>
          <div className="premium-card-header">
            <h3 className="premium-card-title">Invite New Member</h3>
          </div>
          <div style={{ padding: '22px 24px 24px' }}>
            <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Email Address
                </label>
                <input
                  className="premium-input"
                  type="email"
                  placeholder="teammate@example.com"
                  value={addEmail}
                  onChange={e => { setAddEmail(e.target.value); setAddError(''); }}
                  style={{ width: '100%' }}
                  disabled={adding}
                  required
                />
              </div>
              <div style={{ flex: '0 0 150px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Role
                </label>
                <select
                  className="premium-input"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  disabled={adding}
                  style={{ width: '100%' }}
                >
                  {ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ padding: '0 0 1px' }}>
                <button
                  type="submit"
                  disabled={adding || !addEmail.trim()}
                  style={{ whiteSpace: 'nowrap', opacity: adding ? 0.7 : 1, padding: '0 18px' }}
                >
                  {adding ? 'Adding…' : '+ Add Member'}
                </button>
              </div>
            </form>
            {addError && (
              <p style={{ marginTop: '10px', color: '#ef4444', fontSize: '0.85rem', margin: '10px 0 0' }}>{addError}</p>
            )}
            <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 0 }}>
              The user must already have a SPARK account. New members can join via their Telegram invite link too.
            </p>
          </div>
        </div>
      )}

      {/* Team Table */}
      <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="premium-card-header" style={{ padding: '18px 24px' }}>
          <h3 className="premium-card-title">Members</h3>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '12px' }}>
              <svg style={{ animation: 'spin 1s linear infinite' }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            </div>
            Loading team…
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No members found. Add your first team member above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Member', 'Role', 'Joined', isFounder ? 'Actions' : ''].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isMe = m.user_id === user?.id;
                const isOtherFounder = m.role === 'founder' && !isMe;
                const pendingRole = pendingRoles[m.user_id];
                const roleChanged = pendingRole && pendingRole !== m.role;
                const isDeleting = deleting === m.user_id;
                const confirmingDelete = confirmDeleteId === m.user_id;

                return (
                  <tr key={m.user_id} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-soft)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Member Info */}
                    <td style={{ padding: '14px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar email={m.email} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                            {m.email}
                            {isMe && <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>(you)</span>}
                          </div>
                           {m.telegram_id && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#2AABEE"/><path fill="#fff" d="M5.4 11.8l11.4-4.4c.5-.2.9.1.8.6l-1.9 9.1c-.1.5-.4.7-.8.4l-2.3-1.7-1.1 1.1c-.1.1-.3.2-.5.2l.2-2.4 4.3-3.9c.2-.2-.1-.3-.3-.1l-5.3 3.3-2.3-.7c-.5-.2-.5-.5.1-.7z"/></svg>
                              Telegram Linked
                            </div>
                          )}
                          {m.whatsapp_id && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                              WhatsApp Linked
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td style={{ padding: '14px 24px' }}>
                      {isFounder && !isMe && !isOtherFounder ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            className="premium-input"
                            value={pendingRole || m.role}
                            onChange={e => setPendingRoles(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                            style={{ padding: '6px 10px', fontSize: '0.83rem', minWidth: '110px' }}
                            disabled={savingRole === m.user_id}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                          </select>
                          {roleChanged && (
                            <button
                              onClick={() => handleUpdateRole(m.user_id)}
                              disabled={savingRole === m.user_id}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: savingRole === m.user_id ? 0.7 : 1 }}
                            >
                              {savingRole === m.user_id ? '…' : 'Save'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>

                    {/* Joined */}
                    <td style={{ padding: '14px 24px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {formatDate(m.joined_at)}
                    </td>

                    {/* Actions (founder only) */}
                    {isFounder && (
                      <td style={{ padding: '14px 24px' }}>
                        {!isMe && !isOtherFounder && (
                          confirmingDelete ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Remove?</span>
                              <button
                                onClick={() => handleRemoveMember(m.user_id, m.email)}
                                disabled={isDeleting}
                                style={{ padding: '5px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                {isDeleting ? '…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId('')}
                                style={{ padding: '5px 12px', fontSize: '0.8rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(m.user_id)}
                              style={{ padding: '5px 14px', fontSize: '0.8rem', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              Remove
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Links — single combined card */}
      {isFounder && (orgInfo?.join_link || orgInfo?.whatsapp_join_link || orgInfo?.join_code) && (
        <div className="premium-card" style={{ marginTop: '24px' }}>
          <div className="premium-card-header">
            <h3 className="premium-card-title">Invite Links</h3>
          </div>

          <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '24px' }}>

            {/* Telegram row */}
            {orgInfo?.join_link && (
              <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="12" fill="#2AABEE"/>
                    <path fill="#fff" d="M5.4 11.8l11.4-4.4c.5-.2.9.1.8.6l-1.9 9.1c-.1.5-.4.7-.8.4l-2.3-1.7-1.1 1.1c-.1.1-.3.2-.5.2l.2-2.4 4.3-3.9c.2-.2-.1-.3-.3-.1l-5.3 3.3-2.3-.7c-.5-.2-.5-.5.1-.7z"/>
                  </svg>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Telegram</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <a
                    href={orgInfo.join_link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      maxWidth: '100%',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      background: 'var(--panel-soft)',
                      border: '1px solid var(--border)',
                      color: '#2AABEE',
                      textDecoration: 'none',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {orgInfo.join_link}
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(orgInfo.join_link).then(() => setNotice('Telegram join link copied!'))}
                    style={{ padding: '10px 18px', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}

            {/* WhatsApp row */}
            {(orgInfo?.whatsapp_join_link || orgInfo?.join_code) && (
              <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#25D366" style={{ flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>WhatsApp</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {orgInfo.whatsapp_join_link ? (
                    <a
                      href={orgInfo.whatsapp_join_link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        maxWidth: '100%',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        background: 'var(--panel-soft)',
                        border: '1px solid var(--border)',
                        color: '#25D366',
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {orgInfo.whatsapp_join_link}
                    </a>
                  ) : (
                    <a
                      href={`https://wa.me/?text=join_${orgInfo.join_code}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        maxWidth: '100%',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        background: 'var(--panel-soft)',
                        border: '1px solid var(--border)',
                        color: '#25D366',
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {`https://wa.me/?text=join_${orgInfo.join_code}`}
                    </a>
                  )}
                  <button
                    onClick={() => {
                      const link = orgInfo.whatsapp_join_link || `https://wa.me/?text=join_${orgInfo.join_code}`;
                      navigator.clipboard.writeText(link).then(() => setNotice('WhatsApp join link copied!'));
                    }}
                    style={{ padding: '10px 18px', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}


      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .premium-input { background: var(--panel-soft); border: 1px solid var(--border); border-radius: 6px; padding: 9px 12px; color: var(--text); font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .premium-input:focus { border-color: #6366f1; }
      `}</style>
    </div>
  );
}
