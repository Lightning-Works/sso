'use client'

/**
 * /wallet/divi/grant?app=<slug>&scopes=balance:read,send:request&return=<url>
 *
 * The OAuth-style consent screen. A game (or any app) redirects the user
 * here to request DiviGo wallet access. The user sees what's being asked,
 * approves or denies, and is bounced back to `return` with either
 * `?divigo_granted=1` or `?divigo_granted=0`.
 *
 * Three pre-conditions checked client-side:
 *   1. User signed in    → if not, redirect to /login?next=<this page>
 *   2. App valid + DiviGo-enabled → show the consent prompt
 *   3. User has DiviGo linked → if not, show "Link first" with a forward
 *      to /wallet/divi that returns here after linking.
 */

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SCOPE_LABELS: Record<string, string> = {
  'balance:read': 'View your DiviGo balance',
  'send:request': 'Request payments (each one approved in Telegram)',
}

function isSafeReturn(url: string): boolean {
  // Allow http(s) absolute URLs. Apps will whitelist their own callback URL.
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:' }
  catch { return false }
}

function GrantInner() {
  const router = useRouter()
  const params = useSearchParams()
  const appSlug = (params.get('app') || '').trim().toLowerCase()
  const returnUrl = params.get('return') || ''
  const scopesRaw = (params.get('scopes') || '').split(',').map(s => s.trim()).filter(Boolean)

  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [appInfo, setAppInfo] = useState<{ slug: string; name: string; linked: boolean; existingScopes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Load the app's display name + check the user's DiviGo link status.
  // Re-using /api/divigo/status (cookie session) gives us link state; for app
  // info we hit a small lookup. To avoid building another endpoint, fold the
  // checks into one round-trip via /api/oauth/divigo/grant-info (added below
  // for the consent screen specifically).
  const loadInfo = useCallback(async () => {
    if (!appSlug) { setError('Missing app slug'); return }
    try {
      const r = await fetch(`/api/oauth/divigo/grant-info?app=${encodeURIComponent(appSlug)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      setAppInfo({
        slug: j.slug, name: j.name,
        linked: !!j.linked,
        existingScopes: j.existingScopes || [],
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [appSlug])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null); setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (authChecked && userId) loadInfo()
  }, [authChecked, userId, loadInfo])

  const validScopes = scopesRaw.filter(s => s in SCOPE_LABELS)

  const finish = (granted: boolean) => {
    if (!returnUrl || !isSafeReturn(returnUrl)) {
      router.push('/account/connections')
      return
    }
    const u = new URL(returnUrl)
    u.searchParams.set('divigo_granted', granted ? '1' : '0')
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
      finish(true)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  // Need-sign-in branch — bounce to login with this page as `next`.
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
