'use client'

/**
 * /account/connections — user-facing dashboard of apps with DiviGo grants.
 *
 * Lists each app that has a grant row (active or revoked) for this user,
 * with its scopes, when it was granted, and last-used time. Revoke button
 * immediately invalidates access; the app's next call will get 403.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Connection {
  app_slug: string
  app_name: string
  scopes: string[]
  granted_at: string
  revoked_at: string | null
  last_used_at: string | null
}

const SCOPE_LABEL: Record<string, string> = {
  'balance:read': 'View balance',
  'send:request': 'Request payments',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function ConnectionsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null); setAuthChecked(true)
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/oauth/divigo/connections', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      setConnections(j.connections || [])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => { if (authChecked && userId) load() }, [authChecked, userId, load])

  const revoke = async (slug: string) => {
    setRevoking(slug)
    try {
      await fetch('/api/oauth/divigo/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_slug: slug }),
      })
      await load()
    } catch { /* */ }
    setRevoking(null)
  }

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>
        <div style={{ background: '#0b0b0b', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', color: 'var(--lw-text-white)', fontFamily: 'var(--lw-font-display)', fontSize: '1.4rem' }}>
            Connected Apps — DiviGo Wallet
          </h1>
          <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
            Apps you&apos;ve allowed to read your DiviGo balance and/or request payments. Revoking an app blocks it instantly. Sends always require your approval in Telegram regardless.
          </p>

          {!authChecked ? (
            <p style={{ color: 'var(--lw-text-muted)' }}>Loading…</p>
          ) : !userId ? (
            <p style={{ color: 'var(--lw-text-muted)' }}><a href="/login" className="lw-link">Sign in</a> to view your connected apps.</p>
          ) : error ? (
            <p style={{ color: 'var(--lw-error)', fontSize: '0.85rem' }}>{error}</p>
          ) : connections === null ? (
            <p style={{ color: 'var(--lw-text-muted)' }}>Loading…</p>
          ) : connections.length === 0 ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem' }}>
              No apps connected yet. When you authorize an app to use your DiviGo wallet, it&apos;ll show up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {connections.map(c => (
                <div key={c.app_slug} style={{
                  background: '#181818', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '0.85rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                  opacity: c.revoked_at ? 0.55 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--lw-text-white)', fontSize: '0.95rem', fontWeight: 600 }}>
                      {c.app_name}
                      {c.revoked_at && <span style={{ color: 'var(--lw-text-muted)', fontWeight: 400, fontSize: '0.75rem', marginLeft: '0.5rem' }}>(revoked)</span>}
                    </div>
                    <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                      {c.scopes.map(s => SCOPE_LABEL[s] || s).join(' · ')}
                    </div>
                    <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                      Granted {relativeTime(c.granted_at)} · Last used {relativeTime(c.last_used_at)}
                    </div>
                  </div>
                  {!c.revoked_at && (
                    <button onClick={() => revoke(c.app_slug)} disabled={revoking === c.app_slug}
                      style={{
                        background: 'rgba(255,68,68,0.12)', color: 'var(--lw-error)',
                        border: 'none', borderRadius: 4, padding: '0.35rem 0.85rem',
                        fontSize: '0.78rem', cursor: 'pointer',
                      }}>
                      {revoking === c.app_slug ? '…' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="/account" className="lw-link" style={{ fontSize: '0.85rem' }}>← Back to account</a>
          </div>
        </div>
      </div>
    </div>
  )
}
