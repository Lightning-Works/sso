'use client'

/**
 * /wallet/divi/grant?app=<slug>&scopes=balance:read,send:request&return=<url>
 *
 * OAuth-style consent screen. Apps redirect users here; after the user
 * approves we POST /api/oauth/divigo/grant (which mints a per-(user,app)
 * bearer token), then redirect back to `return` with the token in the
 * URL fragment so it never appears in server logs.
 *
 * Security:
 *   - `return` MUST match the app's allowed redirect_origins (server check
 *      enforced by /api/oauth/divigo/grant-info; we also re-check before
 *      navigating).
 *   - User must be signed in (bounce to /login otherwise).
 *   - User must have linked their DiviGo wallet first (link prompt).
 */

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SCOPE_LABELS: Record<string, string> = {
  'balance:read': 'View your DiviGo balance',
  'send:request': 'Request payments (each one approved in Telegram)',
}

interface AppInfo {
  slug: string
  name: string
  linked: boolean
  existingScopes: string[]
  returnAllowed: boolean
}

function GrantInner() {
  const router = useRouter()
  const params = useSearchParams()
  const appSlug = (params.get('app') || '').trim().toLowerCase()
  const returnUrl = params.get('return') || ''
  const scopesRaw = (params.get('scopes') || '').split(',').map(s => s.trim()).filter(Boolean)

  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadInfo = useCallback(async () => {
    if (!appSlug) { setError('Missing app slug'); return }
    if (!returnUrl) { setError('Missing return URL'); return }
    try {
      const r = await fetch(
        `/api/oauth/divigo/grant-info?app=${encodeURIComponent(appSlug)}&return=${encodeURIComponent(returnUrl)}`,
        { cache: 'no-store' },
      )
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      setAppInfo(j)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [appSlug, returnUrl])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null); setAuthChecked(true)
    })
  }, [])
  useEffect(() => { if (authChecked && userId) loadInfo() }, [authChecked, userId, loadInfo])

  const validScopes = scopesRaw.filter(s => s in SCOPE_LABELS)

  const finish = (granted: boolean, appToken?: string) => {
    if (!appInfo?.returnAllowed) {
      // Server already rejected the return URL — fall back to the user
      // dashboard so they aren't stranded.
      router.push('/account/connections')
      return
    }
    const u = new URL(returnUrl)
    u.searchParams.set('divigo_granted', granted ? '1' : '0')
    if (appToken) {
      // Token in fragment — never sent to the server, not in HTTP logs.
      u.hash = `app_token=${encodeURIComponent(appToken)}`
    }
    window.location.href = u.toString()
  }

  const approve = async () => {
    if (!appInfo) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/oauth/divigo/grant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_slug: appInfo.slug, scopes: validScopes }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); setBusy(false); return }
      finish(true, j.app_token)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  if (authChecked && !userId) {
    const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/wallet/divi/grant'
    if (typeof window !== 'undefined') window.location.href = `/login?next=${encodeURIComponent(here)}`
    return null
  }

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '3rem 1rem', width: '100%' }}>
        <div style={{ background: '#0b0b0b', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', color: 'var(--lw-text-white)', fontFamily: 'var(--lw-font-display)', fontSize: '1.4rem' }}>
            Authorize app
          </h1>
          {!appInfo ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
              {error ? <span style={{ color: 'var(--lw-error)' }}>{error}</span> : 'Loading…'}
            </p>
          ) : !appInfo.returnAllowed ? (
            <p style={{ color: 'var(--lw-error)', fontSize: '0.85rem' }}>
              Return URL not allowed for this app. The admin must whitelist it in the app&apos;s redirect origins before consent can complete.
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
                <strong style={{ color: 'var(--lw-text-white)' }}>{appInfo.name}</strong> is asking for access to your DiviGo wallet:
              </p>
              <ul style={{ color: 'var(--lw-text-secondary)', fontSize: '0.88rem', margin: '0 0 1.25rem', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                {validScopes.length === 0 && <li style={{ color: 'var(--lw-error)' }}>No valid scopes requested</li>}
                {validScopes.map(s => <li key={s}>{SCOPE_LABELS[s]}</li>)}
              </ul>

              {!appInfo.linked ? (
                <div style={{ background: 'rgba(240,184,90,0.08)', border: '1px solid rgba(240,184,90,0.25)', borderRadius: 6, padding: '0.75rem 0.9rem', marginBottom: '1rem', color: '#f0b85a', fontSize: '0.85rem' }}>
                  You haven&apos;t linked your DiviGo wallet yet.&nbsp;
                  <a className="lw-link" href={`/wallet/divi?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`}>
                    Link DiviGo first →
                  </a>
                </div>
              ) : (
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                  Every send still requires your approval in Telegram. {appInfo.name} can&apos;t move funds without you saying yes. You can revoke this access anytime at <a className="lw-link" href="/account/connections">Account &rarr; Connections</a>.
                </p>
              )}

              {error && <p style={{ color: 'var(--lw-error)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => finish(false)} disabled={busy}
                  style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4, color: '#bab1a8', cursor: 'pointer' }}>
                  Deny
                </button>
                <button onClick={approve} className="lw-btn lw-btn-primary"
                  disabled={busy || !appInfo.linked || validScopes.length === 0}
                  style={{ width: 'auto', padding: '0.55rem 1.5rem' }}>
                  {busy ? 'Authorizing…' : 'Approve'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GrantPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading…</p></div>}>
      <GrantInner />
    </Suspense>
  )
}
