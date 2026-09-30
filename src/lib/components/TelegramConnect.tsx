'use client'

/**
 * Telegram connection for the account page. Links the signed-in LW-SSO user's Telegram account
 * to their canonical identity (platform_identities) so LightningWorks character bots recognise
 * them across apps. Self-contained: owns its own fetch/poll state. Matches the account page's
 * global lw-* styling. See docs/CROSS_APP_RECOGNITION_BUILD_PLAN.md (Phase 2).
 *
 * Flow: Connect -> POST /api/agent/link-start -> open the returned Telegram deep link -> poll
 * /api/agent/link-status until verified. Disconnect -> POST /api/agent/unlink.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type Status = { verified: boolean; pending: boolean; username: string | null; botUsername?: string }

const ROW_STYLE = { backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', padding: '0.75rem', marginBottom: '0.5rem' } as const
const BTN_BASE = { width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', minWidth: '100px' } as const
const BTN_LINKED = { ...BTN_BASE, backgroundColor: 'rgb(62, 45, 107)', color: '#ccc', cursor: 'default' } as const

function TelegramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#29A9EB" />
      <path d="M5.5 11.8l11-4.24c.51-.19.96.12.79.9l-1.87 8.82c-.13.6-.5.75-1 .47l-2.76-2.03-1.33 1.28c-.15.15-.27.27-.55.27l.2-2.8 5.1-4.6c.22-.2-.05-.31-.34-.12l-6.3 3.97-2.72-.85c-.59-.18-.6-.59.13-.87z" fill="#fff" />
    </svg>
  )
}

export function TelegramConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'expired' | 'error'>('idle')
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try { setStatus(await (await fetch('/api/agent/link-status', { cache: 'no-store' })).json()) }
    catch { /* leave prior status */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const connect = async () => {
    setBusy(true); setErr(''); setPhase('idle')
    try {
      const r = await fetch('/api/agent/link-start', { method: 'POST' })
      const j = await r.json()
      if (!r.ok || !j.deepLink) { setErr(j.error || 'Could not start linking'); setBusy(false); return }
      window.open(j.deepLink, '_blank', 'noopener')
      setPhase('waiting')
      if (timer.current) clearInterval(timer.current)
      const deadline = Date.now() + 10 * 60 * 1000
      const tick = async () => {
        try {
          const s: Status = await (await fetch('/api/agent/link-status', { cache: 'no-store' })).json()
          if (s.verified) { clearInterval(timer.current!); timer.current = null; setStatus(s); setPhase('idle') }
          else if (Date.now() > deadline) { clearInterval(timer.current!); timer.current = null; setPhase('expired') }
        } catch { /* keep polling */ }
      }
      timer.current = setInterval(tick, 2500); tick()
    } catch (e) { setErr(e instanceof Error ? e.message : 'link failed'); setPhase('error') }
    finally { setBusy(false) }
  }

  const disconnect = async () => {
    setBusy(true); setErr('')
    try {
      await fetch('/api/agent/unlink', { method: 'POST' })
      if (timer.current) { clearInterval(timer.current); timer.current = null }
      setPhase('idle')
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'unlink failed') }
    finally { setBusy(false) }
  }

  const verified = !!status?.verified
  const uname = status?.username

  return (
    <div>
      <div className="lw-row" style={ROW_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <TelegramIcon />
          <span className="lw-row-value">{verified ? (uname ? `Telegram @${uname}` : 'Telegram (connected)') : 'Telegram'}</span>
        </div>
        {verified ? (
          <button className="lw-btn lw-btn-connect" style={BTN_BASE} onClick={disconnect} disabled={busy}>
            {busy ? 'Working…' : 'Disconnect'}
          </button>
        ) : phase === 'waiting' ? (
          <button className="lw-btn" style={BTN_LINKED} disabled>Waiting…</button>
        ) : (
          <button className="lw-btn lw-btn-connect" style={BTN_BASE} onClick={connect} disabled={busy}>
            {busy ? 'Starting…' : 'Connect Telegram'}
          </button>
        )}
      </div>
      {!verified && phase === 'waiting' && (
        <p className="lw-row-label" style={{ color: 'var(--lw-purple)', margin: '0.25rem 0 0.5rem' }}>
          Opened Telegram, press <b>Start</b> in the bot. This updates automatically.
        </p>
      )}
      {phase === 'expired' && (
        <p className="lw-row-label" style={{ color: 'var(--lw-error)', margin: '0.25rem 0 0.5rem' }}>
          The link request expired. Tap Connect Telegram to try again.
        </p>
      )}
      {err && <p className="lw-row-label" style={{ color: 'var(--lw-error)', margin: '0.25rem 0 0.5rem' }}>{err}</p>}
    </div>
  )
}
