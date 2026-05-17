'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserRow {
  id: string
  email: string
  username: string
  display_name: string
  role: string
  avatar_outer_color: string
  avatar_inner_color: string
  provider: string
  created_at: string | null
  last_sign_in_at: string | null
  banned: boolean
}

interface AppUsed { origin: string; count: number; last_used: string }
interface Activity { event_type: string; event_category: string; description: string | null; ip_address: string | null; created_at: string }

interface UserDetail extends UserRow {
  avatar_url: string | null
  avatar_pan_x: number
  avatar_pan_y: number
  avatar_zoom: number
  first_login: string | null
  apps_used: AppUsed[]
  recent_activity: Activity[]
}

const inputStyle = { backgroundColor: 'rgb(26,17,46)', color: '#bab1a8' }
const labelStyle = { color: 'var(--lw-text-primary)', fontWeight: 'bold' as const, fontSize: '0.85rem', display: 'block' as const, marginBottom: '0.25rem' }
const ROLES = ['user', 'admin', 'superadmin']
const PAGE_SIZE = 50

type SortField = 'created_at' | 'last_sign_in_at' | 'email' | 'username' | 'display_name' | 'role'

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  return isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function Avatar({ url, outer, inner, name, size = 32 }: { url?: string | null; outer: string; inner: string; name: string; size?: number }) {
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${outer}` }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: inner, border: `2px solid ${outer}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#fff', flexShrink: 0,
    }}>
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  )
}

function SortableTh({ field, label, sort, dir, onToggle }: {
  field: SortField; label: string; sort: SortField; dir: 'asc' | 'desc'; onToggle: (f: SortField) => void
}) {
  return (
    <th onClick={() => onToggle(field)} style={{
      textAlign: 'left', padding: '0.5rem 0.75rem', cursor: 'pointer', color: 'var(--lw-text-primary)',
      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', userSelect: 'none',
    }}>
      {label}{sort === field ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
}

// ── Detail / edit view ──

function UserDetailView({ userId, callerId, callerRole, onClose, onChanged, setMessage }: {
  userId: string; callerId: string; callerRole: string
  onClose: () => void; onChanged: () => void; setMessage: (m: string) => void
}) {
  const [u, setU] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')

  // editable fields
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('user')
  const [outer, setOuter] = useState('#000000')
  const [inner, setInner] = useState('#000000')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/users/${userId}`)
    const data = await res.json()
    if (!res.ok) { setMessage(`Error: ${data.error || 'Failed to load user'}`); setLoading(false); return }
    const user: UserDetail = data.user
    setU(user)
    setDisplayName(user.display_name)
    setUsername(user.username)
    setRole(user.role)
    setOuter(user.avatar_outer_color)
    setInner(user.avatar_inner_color)
    setLoading(false)
  }, [userId, setMessage])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="lw-section"><p style={{ color: 'var(--lw-text-muted)' }}>Loading user…</p></div>
  if (!u) return null

  const isSelf = u.id === callerId
  const canEditRole = !isSelf && (callerRole === 'superadmin' || (u.role !== 'admin' && u.role !== 'superadmin'))
  const canDelete = callerRole === 'superadmin' && !isSelf
  const canBan = !isSelf && (callerRole === 'superadmin' || (u.role !== 'admin' && u.role !== 'superadmin'))

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName, username, role, avatar_outer_color: outer, avatar_inner_color: inner }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMessage(`Error: ${data.error || 'Save failed'}`); return }
    setMessage('User updated')
    onChanged(); load()
  }

  const doAction = async (path: string, body: object, label: string) => {
    setBusy(label)
    const res = await fetch(`/api/admin/users/${u.id}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) { setMessage(`Error: ${data.error || label + ' failed'}`); return }
    setMessage(`${label} done`)
    onChanged(); load()
  }

  const doDelete = async () => {
    setBusy('delete')
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    const data = await res.json()
    setBusy('')
    if (!res.ok) { setMessage(`Error: ${data.error || 'Delete failed'}`); return }
    setMessage('User deleted')
    onChanged(); onClose()
  }

  const stat = (label: string, value: string) => (
    <div>
      <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', display: 'block' }}>{label}</span>
      <span style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem' }}>{value}</span>
    </div>
  )

  return (
    <div className="lw-section" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Avatar url={u.avatar_url} outer={outer} inner={inner} name={displayName || username || u.email} size={44} />
          <div>
            <h3 className="lw-section-title" style={{ margin: 0 }}>{u.display_name || u.username || u.email}</h3>
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>{u.email} · {u.provider}{u.banned ? ' · BANNED' : ''}</span>
          </div>
        </div>
        <button onClick={onClose} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.85rem' }}>Close</button>
      </div>

      {/* Editable fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>Display Name</label>
          <input className="lw-input" style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Username</label>
          <input className="lw-input" style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select className="lw-input" style={inputStyle} value={role} disabled={!canEditRole} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => (
              <option key={r} value={r} disabled={(r === 'admin' || r === 'superadmin') && callerRole !== 'superadmin'}>{r}</option>
            ))}
          </select>
          {!canEditRole && <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>{isSelf ? "You can't change your own role." : 'Superadmin required to modify this user’s role.'}</span>}
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Avatar Border</label>
            <input type="color" value={outer} onChange={e => setOuter(e.target.value)} style={{ width: '48px', height: '38px', background: 'none', border: 'none' }} />
          </div>
          <div>
            <label style={labelStyle}>Avatar Inner</label>
            <input type="color" value={inner} onChange={e => setInner(e.target.value)} style={{ width: '48px', height: '38px', background: 'none', border: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button onClick={save} disabled={saving} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={() => doAction('reset-password', {}, 'Password reset')} disabled={busy === 'Password reset'} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          {busy === 'Password reset' ? '…' : 'Send Password Reset'}
        </button>
        {canBan && (
          <button onClick={() => doAction('ban', { ban: !u.banned }, u.banned ? 'Unban' : 'Ban')} disabled={!!busy} className="lw-btn" style={{
            width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem',
            backgroundColor: u.banned ? 'rgba(68,255,68,0.15)' : 'rgba(255,68,68,0.15)',
            color: u.banned ? 'var(--lw-success)' : 'var(--lw-error)', cursor: 'pointer',
          }}>
            {u.banned ? 'Unban User' : 'Ban User'}
          </button>
        )}
        {canDelete && (
          <button onClick={() => setConfirmDelete(' ')} className="lw-btn" style={{
            width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem',
            backgroundColor: 'rgba(255,68,68,0.1)', color: 'var(--lw-error)', cursor: 'pointer', marginLeft: 'auto',
          }}>Delete User</button>
        )}
      </div>

      {/* Typed delete confirmation */}
      {confirmDelete !== '' && (
        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--lw-radius-sm)', border: '1px solid var(--lw-error)', background: 'rgba(255,68,68,0.08)' }}>
          <p style={{ color: 'var(--lw-error)', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>
            Permanently delete <strong>{u.email}</strong> and their profile? This cannot be undone. Type <strong>DELETE</strong> to confirm.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="lw-input" style={{ ...inputStyle, width: '160px' }} value={confirmDelete.trim()} onChange={e => setConfirmDelete(e.target.value || ' ')} placeholder="DELETE" />
            <button onClick={doDelete} disabled={confirmDelete.trim() !== 'DELETE' || busy === 'delete'} className="lw-btn" style={{
              width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', backgroundColor: 'var(--lw-error)', color: '#fff',
              cursor: confirmDelete.trim() === 'DELETE' ? 'pointer' : 'not-allowed', opacity: confirmDelete.trim() === 'DELETE' ? 1 : 0.5,
            }}>{busy === 'delete' ? 'Deleting…' : 'Confirm Delete'}</button>
            <button onClick={() => setConfirmDelete('')} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Read-only stats */}
      <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        {stat('User ID', u.id)}
        {stat('Provider', u.provider)}
        {stat('Signed up', fmt(u.created_at))}
        {stat('First login', fmt(u.first_login))}
        {stat('Last login', fmt(u.last_sign_in_at))}
        {stat('Status', u.banned ? 'Banned' : 'Active')}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={labelStyle}>Apps used <span style={{ fontWeight: 400, color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>(from token-verify events; origins, best-effort)</span></label>
        {u.apps_used.length === 0
          ? <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem' }}>No verified app usage recorded.</p>
          : u.apps_used.map(a => (
            <div key={a.origin} style={{ fontSize: '0.78rem', color: 'var(--lw-text-secondary)', fontFamily: 'monospace' }}>
              {a.origin} · {a.count}× · last {fmt(a.last_used)}
            </div>
          ))}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={labelStyle}>Recent activity</label>
        {u.recent_activity.length === 0
          ? <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem' }}>No activity logged.</p>
          : u.recent_activity.map((a, i) => (
            <div key={i} style={{ fontSize: '0.75rem', color: 'var(--lw-text-secondary)', fontFamily: 'monospace', padding: '0.1rem 0' }}>
              {fmt(a.created_at)} · {a.event_type}{a.description ? ` · ${a.description}` : ''}
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Main panel ──

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [sort, setSort] = useState<SortField>('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [caller, setCaller] = useState<{ id: string; role: string }>({ id: '', role: 'user' })

  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setCaller({ id: user.id, role: profile?.role || 'user' })
    })()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setOffset(0) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ sort, dir, limit: String(PAGE_SIZE), offset: String(offset) })
    if (debounced) params.set('q', debounced)
    if (roleFilter) params.set('role', roleFilter)
    const res = await fetch(`/api/admin/users?${params}`)
    const data = await res.json()
    if (res.ok) { setUsers(data.users || []); setTotal(data.total || 0) }
    setLoading(false)
  }, [sort, dir, offset, debounced, roleFilter])

  useEffect(() => { loadUsers() }, [loadUsers])

  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 4000)
    return () => clearTimeout(t)
  }, [message])

  const toggleSort = (field: SortField) => {
    if (sort === field) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(field); setDir('asc') }
    setOffset(0)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 className="lw-section-title" style={{ margin: 0 }}>Users ({total})</h2>
      </div>

      {message && (
        <div style={{
          padding: '0.6rem 1rem', marginBottom: '1rem', borderRadius: 'var(--lw-radius-sm)', textAlign: 'center',
          background: message.startsWith('Error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)',
          color: message.startsWith('Error') ? 'var(--lw-error)' : 'var(--lw-success)',
        }}>{message}</div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input className="lw-input" style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
          placeholder="Search email, username, name, or id…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="lw-input" style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setOffset(0) }}>
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {selected && (
        <UserDetailView
          userId={selected} callerId={caller.id} callerRole={caller.role}
          onClose={() => setSelected(null)} onChanged={loadUsers} setMessage={setMessage}
        />
      )}

      <div className="lw-section" style={{ padding: 0, overflowX: 'auto', marginTop: selected ? '1rem' : 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th style={{ padding: '0.5rem 0.75rem' }} />
              <SortableTh field="email" label="Email" sort={sort} dir={dir} onToggle={toggleSort} />
              <SortableTh field="username" label="Username" sort={sort} dir={dir} onToggle={toggleSort} />
              <SortableTh field="display_name" label="Display Name" sort={sort} dir={dir} onToggle={toggleSort} />
              <SortableTh field="role" label="Role" sort={sort} dir={dir} onToggle={toggleSort} />
              <SortableTh field="created_at" label="Signed Up" sort={sort} dir={dir} onToggle={toggleSort} />
              <SortableTh field="last_sign_in_at" label="Last Login" sort={sort} dir={dir} onToggle={toggleSort} />
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--lw-text-primary)', fontWeight: 700 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--lw-text-muted)' }}>Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--lw-text-muted)' }}>No users found.</td></tr>}
            {!loading && users.map(u => (
              <tr key={u.id} onClick={() => setSelected(u.id)} style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                background: selected === u.id ? 'rgba(106,36,250,0.12)' : 'transparent',
              }}>
                <td style={{ padding: '0.4rem 0.75rem' }}>
                  <Avatar outer={u.avatar_outer_color} inner={u.avatar_inner_color} name={u.display_name || u.username || u.email} />
                </td>
                <td style={{ padding: '0.4rem 0.75rem', color: 'var(--lw-text-white)', fontSize: '0.85rem' }}>{u.email || '—'}</td>
                <td style={{ padding: '0.4rem 0.75rem', color: 'var(--lw-text-secondary)', fontSize: '0.85rem' }}>{u.username || '—'}</td>
                <td style={{ padding: '0.4rem 0.75rem', color: 'var(--lw-text-secondary)', fontSize: '0.85rem' }}>{u.display_name || '—'}</td>
                <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  <span style={{
                    padding: '1px 7px', borderRadius: '3px', fontSize: '0.7rem',
                    background: u.role === 'superadmin' ? 'rgba(106,36,250,0.25)' : u.role === 'admin' ? 'rgba(106,36,250,0.15)' : 'rgba(255,255,255,0.06)',
                    color: u.role === 'user' ? 'var(--lw-text-muted)' : 'var(--lw-text-white)',
                  }}>{u.role}</span>
                </td>
                <td style={{ padding: '0.4rem 0.75rem', color: 'var(--lw-text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmt(u.created_at)}</td>
                <td style={{ padding: '0.4rem 0.75rem', color: 'var(--lw-text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmt(u.last_sign_in_at)}</td>
                <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                  <span style={{ color: u.banned ? 'var(--lw-error)' : 'var(--lw-success)' }}>{u.banned ? 'banned' : 'active'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
        <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem' }}>
          {total === 0 ? '0' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}
            className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 1rem', fontSize: '0.8rem', opacity: offset === 0 ? 0.5 : 1 }}>Prev</button>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}
            className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 1rem', fontSize: '0.8rem', opacity: offset + PAGE_SIZE >= total ? 0.5 : 1 }}>Next</button>
        </div>
      </div>
    </div>
  )
}
