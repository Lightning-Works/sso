'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface LogEntry {
  id: number
  user_id: string | null
  username: string | null
  email: string | null
  event_type: string
  event_category: string
  description: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const CATEGORIES = ['', 'auth', 'wallet', 'tx', 'profile', 'admin', 'system']
const CATEGORY_COLORS: Record<string, string> = {
  auth: '#4285F4',
  wallet: '#34A853',
  tx: '#FF8800',
  profile: '#9146FF',
  admin: '#FF4444',
  system: '#888',
}

const PAGE_SIZE = 50

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (category) params.set('category', category)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))

    const res = await fetch(`/api/admin/logs?${params}`)
    const data = await res.json()

    if (data.error) {
      if (res.status === 401) router.push('/login')
      if (res.status === 403) router.push('/account')
      return
    }

    setLogs(data.logs || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [search, category, offset, router])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
    fetchLogs()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="lw-account-page">
      <div className="lw-account-container" style={{ maxWidth: '64rem' }}>

        <div className="lw-account-header">
          <h1 className="lw-heading-xl">Audit Logs</h1>
          <a href="/admin" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            ← Back to Admin
          </a>
        </div>

        {/* Search and Filters */}
        <div className="lw-section">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by email, username, IP, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="lw-input"
              style={{ flex: 1, minWidth: '200px', backgroundColor: 'rgb(26,17,46)', color: '#bab1a8' }}
            />
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setOffset(0) }}
              className="lw-input"
              style={{ width: 'auto', minWidth: '120px', backgroundColor: 'rgb(26,17,46)', color: '#bab1a8' }}
            >
              <option value="">All Categories</option>
              {CATEGORIES.filter(c => c).map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <button type="submit" className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
              Search
            </button>
          </form>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {total.toLocaleString()} events found
          </p>
        </div>

        {/* Log Entries */}
        <div className="lw-section" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--lw-text-muted)' }}>
              <span className="lw-dots">Loading</span>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--lw-text-muted)' }}>
              No logs found
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px 70px 120px 1fr 100px', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(106,36,250,0.2)', fontSize: '0.75rem', color: 'var(--lw-text-muted)', fontWeight: 600 }}>
                <span>Time</span>
                <span>Cat</span>
                <span>Event</span>
                <span>Details</span>
                <span>User</span>
              </div>

              {logs.map(log => (
                <div key={log.id}>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '140px 70px 120px 1fr 100px', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.8rem' }}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>
                      {formatDate(log.created_at)}
                    </span>
                    <span style={{ color: CATEGORY_COLORS[log.event_category] || '#888', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                      {log.event_category}
                    </span>
                    <span style={{ color: 'var(--lw-text-primary)', fontSize: '0.75rem' }}>
                      {log.event_type}
                    </span>
                    <span style={{ color: 'var(--lw-text-secondary)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.description || '—'}
                    </span>
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.username || log.email?.split('@')[0] || '—'}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {expandedId === log.id && (
                    <div style={{ padding: '0.75rem 0.75rem 0.75rem 2rem', backgroundColor: 'var(--lw-wallet-row-bg)', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.3rem 1rem', color: 'var(--lw-text-secondary)' }}>
                        <span style={{ color: 'var(--lw-text-muted)' }}>Event ID</span>
                        <span>{log.id}</span>
                        <span style={{ color: 'var(--lw-text-muted)' }}>User ID</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{log.user_id || '—'}</span>
                        <span style={{ color: 'var(--lw-text-muted)' }}>Username</span>
                        <span>{log.username || '—'}</span>
                        <span style={{ color: 'var(--lw-text-muted)' }}>Email</span>
                        <span>{log.email || '—'}</span>
                        <span style={{ color: 'var(--lw-text-muted)' }}>IP Address</span>
                        <span style={{ fontFamily: 'monospace' }}>{log.ip_address || '—'}</span>
                        <span style={{ color: 'var(--lw-text-muted)' }}>Description</span>
                        <span>{log.description || '—'}</span>
                        {Object.keys(log.metadata || {}).length > 0 && (
                          <>
                            <span style={{ color: 'var(--lw-text-muted)' }}>Metadata</span>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--lw-text-secondary)', fontSize: '0.7rem' }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </>
                        )}
                        <span style={{ color: 'var(--lw-text-muted)' }}>User Agent</span>
                        <span style={{ fontSize: '0.65rem', wordBreak: 'break-all' }}>{log.user_agent || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="lw-btn lw-btn-connect"
              style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.85rem', opacity: offset === 0 ? 0.3 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="lw-btn lw-btn-connect"
              style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.85rem', opacity: offset + PAGE_SIZE >= total ? 0.3 : 1 }}
            >
              Next →
            </button>
          </div>
        )}

        <div className="lw-footer-links" style={{ paddingBottom: '2rem' }}>
          <p className="lw-footer-text">
            Logs retained for 2 years per GDPR compliance. PII masked after retention period.
          </p>
        </div>

      </div>
    </div>
  )
}
