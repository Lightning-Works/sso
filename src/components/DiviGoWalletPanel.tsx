'use client'

/**
 * DiviGoWalletPanel — the bottom block on /wallet/divi.
 *
 * Three rendering modes, all live in the same component:
 *
 *   1. Not signed in  → "Sign in to use DiviGo wallet" prompt.
 *   2. Signed in, no link  → link form (number + route dropdown + Link button).
 *   3. Signed in, linked    → balance display + send panel.
 *
 * The send panel is greyed (functional UI visible, controls disabled) when
 * either (a) the user hasn't linked yet, or (b) the server isn't configured
 * with DIVIGO_API_KEY. We never *hide* the UI behind the API key — per the
 * project rule, intended UI shows in a disabled state, not as a substitute.
 *
 * Send flow:
 *   submit → /api/divigo/request-transfer → returns { code } →
 *   poll /api/divigo/check?code= every 3s → on completion, render the
 *   approval result and refresh the balance.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type DivigoRoute = 'telegram' | 'wa' | 'whatsapp' | 'telegramLaunchGoat' | 'meta' | 'signal'

interface StatusResponse {
  configured: boolean
  projectName: string | null
  linked: boolean
  link: { divigo_number: string; divigo_route: string; linked_at: string; last_verified_at: string | null } | null
}

// Coins DiviGo's `balance` method iterates when coin='all'.
const SUPPORTED_COINS = ['divi', 'btc', 'eth', 'ltc', 'doge', 'core'] as const
const COIN_LABEL: Record<string, string> = {
  divi: 'DIVI', btc: 'BTC', eth: 'ETH', ltc: 'LTC', doge: 'DOGE', core: 'CORE',
}

const PANEL_BG = '#181818'
const RADIUS = 8

function panelStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    backgroundColor: PANEL_BG,
    borderRadius: RADIUS,
    border: '1px solid rgba(255,255,255,0.06)',
    ...extra,
  }
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'rgb(26,17,46)',
  color: '#bab1a8',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding: '0.45rem 0.65rem',
  fontSize: '0.9rem',
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function DiviGoWalletPanel({ userId, diviPrice }: { userId: string | null; diviPrice: number }) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [balances, setBalances] = useState<Record<string, number> | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Link form
  const [linkNumber, setLinkNumber] = useState('')
  const [linkRoute, setLinkRoute] = useState<DivigoRoute>('telegram')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)

  // Send form
  const [sendCoin, setSendCoin] = useState('divi')
  const [sendAmount, setSendAmount] = useState('')
  const [sendDest, setSendDest] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<unknown>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Poll for up to ~3 minutes before suggesting the user retry. Telegram
  // approvals are usually instant but the user might be away from the chat.
  const pollDeadline = useRef<number>(0)
  const [pollExpired, setPollExpired] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/divigo/status', { cache: 'no-store' })
      const j: StatusResponse = await r.json()
      setStatus(j)
    } catch { /* render whatever we have */ }
  }, [])

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true); setBalanceError(null)
    try {
      const r = await fetch('/api/divigo/balance', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) {
        setBalances(null)
        setBalanceError(j.error === 'not_configured' ? 'API key not configured on server'
          : j.error === 'not_linked' ? null  // already covered by the link form
          : (j.error || `HTTP ${r.status}`))
      } else {
        setBalances(j.balances || {})
      }
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : String(e))
    }
    setBalanceLoading(false)
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    if (status?.linked && status?.configured) loadBalance()
    else { setBalances(null); setBalanceError(null) }
  }, [status?.linked, status?.configured, loadBalance])

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
  }, [])
  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback((code: string) => {
    stopPolling()
    pollDeadline.current = Date.now() + 3 * 60 * 1000
    setPollExpired(false)
    const tick = async () => {
      try {
        const r = await fetch(`/api/divigo/check?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
        const j = await r.json()
        if (j.status === 'completed') {
          setSendResult(j.completed ?? true)
          stopPolling()
          loadBalance()
          return
        }
      } catch { /* keep trying */ }
      if (Date.now() > pollDeadline.current) {
        setPollExpired(true)
        stopPolling()
      }
    }
    pollTimer.current = setInterval(tick, 3000)
    tick()
  }, [stopPolling, loadBalance])

  const submitLink = async () => {
    setLinkBusy(true); setLinkError(null)
    try {
      const r = await fetch('/api/divigo/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: linkNumber, route: linkRoute }),
      })
      const j = await r.json()
      if (!r.ok) { setLinkError(j.error || `HTTP ${r.status}`) }
      else {
        setLinkNumber('')
        await loadStatus()
      }
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e))
    }
    setLinkBusy(false)
  }

  const submitUnlink = async () => {
    setShowUnlinkConfirm(false)
    try {
      await fetch('/api/divigo/unlink', { method: 'POST' })
      setBalances(null)
      setSendCode(null); setSendResult(null); setSendError(null)
      stopPolling()
      await loadStatus()
    } catch { /* */ }
  }

  const submitSend = async () => {
    setSendBusy(true); setSendError(null); setSendResult(null); setSendCode(null)
    try {
      const r = await fetch('/api/divigo/request-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: sendCoin, amount: sendAmount, destination: sendDest, subject: sendSubject }),
      })
      const j = await r.json()
      if (!r.ok) { setSendError(j.error || `HTTP ${r.status}`) }
      else if (j.code) { setSendCode(j.code); startPolling(j.code) }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    }
    setSendBusy(false)
  }

  const dismissSendFlow = () => {
    stopPolling()
    setSendCode(null); setSendResult(null); setSendError(null); setPollExpired(false)
    setSendAmount(''); setSendDest(''); setSendSubject('')
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const configured = !!status?.configured
  const linked = !!status?.linked
  const canSend = !!userId && configured && linked && !sendCode && !sendResult
  const showSendPlaceholderState = !canSend && !sendCode

  const headerBadge = !configured
    ? { text: 'Inactive — no API key', color: 'var(--lw-text-muted)', border: 'rgba(255,255,255,0.15)' }
    : !linked
    ? { text: 'Link your account to enable', color: '#f0b85a', border: 'rgba(240,184,90,0.4)' }
    : { text: 'Active', color: '#2ea043', border: 'rgba(46,160,67,0.5)' }

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <h2 style={{
        color: 'var(--lw-text-white)',
        fontFamily: 'var(--lw-font-display)',
        fontSize: '1.1rem', marginBottom: '0.75rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/divigo_logo_round_128px.webp" alt="DiviGo" width={22} height={22} style={{ borderRadius: '50%' }} />
        DiviGo Wallet
        {status?.projectName && (
          <span style={{ fontSize: '0.7rem', color: 'var(--lw-text-muted)', fontWeight: 400, marginLeft: '0.25rem' }}>
            · {status.projectName}
          </span>
        )}
        <span style={{
          marginLeft: 'auto', fontSize: '0.7rem',
          color: headerBadge.color,
          border: `1px solid ${headerBadge.border}`,
          borderRadius: 4, padding: '1px 6px',
        }}>
          {headerBadge.text}
        </span>
      </h2>

      {/* Signed-out shell — keep the full visual but prompt sign-in. */}
      {!userId ? (
        <div style={panelStyle({ padding: '1rem', textAlign: 'center', color: 'var(--lw-text-secondary)', fontSize: '0.9rem' })}>
          <a href="/login" className="lw-link">Sign in</a> to link and use your DiviGo wallet.
        </div>
      ) : status === null ? (
        <div style={panelStyle({ padding: '1rem', textAlign: 'center', color: 'var(--lw-text-muted)', fontSize: '0.85rem' })}>
          Loading…
        </div>
      ) : (
        <>
          {/* ─── Link form (when not linked) ─────────────────────────── */}
          {!linked && (
            <div style={panelStyle({ padding: '1rem', marginBottom: '0.75rem' })}>
              <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.45 }}>
                Connect your DiviGo account to see your balance and send crypto. We&apos;ll only
                <em> request</em> sends — every transaction needs your approval in Telegram (or whichever
                messenger you registered with).
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <select
                  value={linkRoute}
                  onChange={e => setLinkRoute(e.target.value as DivigoRoute)}
                  style={{ ...inputStyle, minWidth: '130px' }}
                  disabled={linkBusy}
                >
                  <option value="telegram">Telegram</option>
                  <option value="wa">WhatsApp</option>
                </select>
                <input
                  type="text"
                  value={linkNumber}
                  onChange={e => setLinkNumber(e.target.value)}
                  placeholder={linkRoute === 'telegram' ? '@username or phone (with country code)' : 'Phone with country code, or @username'}
                  style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
                  disabled={linkBusy}
                />
                <button
                  onClick={submitLink}
                  className="lw-btn lw-btn-primary"
                  disabled={linkBusy || !linkNumber.trim()}
                  style={{ width: 'auto', padding: '0.45rem 1.25rem' }}
                >
                  {linkBusy ? 'Linking…' : 'Link'}
                </button>
              </div>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>
                Use the DiviGo @username you picked at signup, or the phone number you registered with (include the country code, no &lsquo;+&rsquo;). Whichever you used to set up your DiviGo account.
              </p>
              {linkError && (
                <p style={{ color: 'var(--lw-error)', fontSize: '0.78rem', margin: '0.4rem 0 0' }}>
                  {linkError}
                </p>
              )}
            </div>
          )}

          {/* ─── Linked-account summary ──────────────────────────────── */}
          {linked && status.link && (
            <div style={panelStyle({ padding: '0.7rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>Linked DiviGo account</div>
                <div style={{ color: 'var(--lw-text-white)', fontSize: '0.9rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {status.link.divigo_number}
                  <span style={{ color: 'var(--lw-text-muted)', marginLeft: '0.5rem', fontFamily: 'inherit' }}>
                    via {status.link.divigo_route === 'wa' ? 'WhatsApp' : status.link.divigo_route}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowUnlinkConfirm(true)}
                style={{
                  background: 'rgba(255,68,68,0.12)', color: 'var(--lw-error)',
                  border: 'none', borderRadius: 4, padding: '0.3rem 0.75rem',
                  fontSize: '0.78rem', cursor: 'pointer',
                }}
              >
                Unlink
              </button>
            </div>
          )}

          {/* ─── Balance block (always shown so the UI shape is stable) ── */}
          <div style={panelStyle({ padding: '1rem', marginBottom: '0.75rem', opacity: linked && configured ? 1 : 0.5 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                DiviGo balances
              </span>
              {linked && configured && (
                <button
                  onClick={loadBalance}
                  disabled={balanceLoading}
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--lw-text-muted)', borderRadius: 4,
                    padding: '0.2rem 0.55rem', fontSize: '0.7rem', cursor: 'pointer',
                  }}
                >
                  {balanceLoading ? '…' : 'Refresh'}
                </button>
              )}
            </div>
            {balanceError ? (
              <p style={{ color: 'var(--lw-error)', fontSize: '0.78rem', margin: '0.5rem 0 0' }}>{balanceError}</p>
            ) : balances === null ? (
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                {linked && configured ? 'Loading…' : '— · — · —'}
              </p>
            ) : Object.keys(balances).length === 0 ? (
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                No balance found. If you have DiviGo coins, the account may not yet be active for these coins.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem', marginTop: '0.25rem' }}>
                {Object.entries(balances).map(([coin, amt]) => (
                  <div key={coin}>
                    <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {COIN_LABEL[coin] || coin.toUpperCase()}
                    </div>
                    <div style={{ color: 'var(--lw-text-white)', fontSize: '0.95rem', fontWeight: 600 }}>
                      {fmt(amt)}
                    </div>
                    {coin === 'divi' && diviPrice > 0 && (
                      <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>
                        ${(amt * diviPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Send panel — greyed when not linked / not configured ─── */}
          <div style={panelStyle({ padding: '1rem', opacity: canSend || sendCode ? 1 : 0.5 })}
               aria-disabled={showSendPlaceholderState ? 'true' : undefined}>
            <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
              Send crypto from DiviGo
            </div>

            {!sendCode && !sendResult ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select
                    value={sendCoin}
                    onChange={e => setSendCoin(e.target.value)}
                    disabled={!canSend || sendBusy}
                    style={inputStyle}
                  >
                    {SUPPORTED_COINS.map(c => <option key={c} value={c}>{COIN_LABEL[c]}</option>)}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={e => setSendAmount(e.target.value)}
                    placeholder="Amount"
                    disabled={!canSend || sendBusy}
                    style={inputStyle}
                  />
                </div>
                <input
                  type="text"
                  value={sendDest}
                  onChange={e => setSendDest(e.target.value)}
                  placeholder="Destination address"
                  disabled={!canSend || sendBusy}
                  style={{ ...inputStyle, width: '100%', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                />
                <input
                  type="text"
                  value={sendSubject}
                  onChange={e => setSendSubject(e.target.value)}
                  placeholder="Note (optional, shown in approval prompt)"
                  disabled={!canSend || sendBusy}
                  style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }}
                />
                {sendError && (
                  <p style={{ color: 'var(--lw-error)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{sendError}</p>
                )}
                <button
                  onClick={submitSend}
                  className="lw-btn lw-btn-primary"
                  disabled={!canSend || sendBusy || !sendAmount.trim() || !sendDest.trim()}
                  style={{ width: 'auto', padding: '0.5rem 1.5rem' }}
                >
                  {sendBusy ? 'Requesting…' : 'Request send'}
                </button>
              </>
            ) : sendResult ? (
              /* Completion — render whatever DiviGo gave us */
              <div>
                <p style={{ color: '#2ea043', fontWeight: 600, margin: '0 0 0.5rem' }}>
                  Approval received from DiviGo.
                </p>
                <pre style={{
                  background: 'rgba(0,0,0,0.4)', color: '#bab1a8',
                  padding: '0.6rem', borderRadius: 4, fontSize: '0.75rem',
                  overflowX: 'auto', margin: '0 0 0.75rem',
                  maxHeight: '180px',
                }}>
                  {typeof sendResult === 'object' ? JSON.stringify(sendResult, null, 2) : String(sendResult)}
                </pre>
                <button
                  onClick={dismissSendFlow}
                  className="lw-btn lw-btn-secondary"
                  style={{ width: 'auto', padding: '0.4rem 1.2rem' }}
                >
                  Done
                </button>
              </div>
            ) : (
              /* Pending state — code issued, waiting on approval */
              <div>
                <p style={{ color: 'var(--lw-text-white)', margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                  Open <strong>{linkRoute === 'telegram' || status?.link?.divigo_route?.includes('telegram') ? 'Telegram' : 'your DiviGo messenger'}</strong> and approve the request.
                </p>
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                  Request code: <code style={{ background: 'rgba(0,0,0,0.4)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>{sendCode}</code>
                </p>
                {pollExpired ? (
                  <p style={{ color: '#f0b85a', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                    Polling timed out after 3 minutes. The request may still be valid — check {status?.link?.divigo_route?.includes('telegram') ? 'Telegram' : 'your messenger'}, or dismiss and try again.
                  </p>
                ) : (
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                    Waiting for approval… <span style={{ opacity: 0.7 }}>(checking every 3s)</span>
                  </p>
                )}
                <button
                  onClick={dismissSendFlow}
                  style={{
                    background: 'rgba(255,255,255,0.06)', color: 'var(--lw-text-secondary)',
                    border: 'none', borderRadius: 4, padding: '0.4rem 1rem',
                    fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ─── Unlink confirmation modal ───────────────────────────── */}
          {showUnlinkConfirm && (
            <div
              onClick={() => setShowUnlinkConfirm(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 10010,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: '#1a1a2e', border: '1px solid rgba(255,68,68,0.4)',
                  borderRadius: 12, padding: '1.25rem',
                  minWidth: 'min(380px, 92vw)', maxWidth: '92vw',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                <h3 style={{ color: '#fff', margin: '0 0 0.6rem', fontSize: '1rem', fontWeight: 700 }}>Unlink DiviGo?</h3>
                <p style={{ color: '#e4dad1', margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  Your DiviGo balance and send panel will be hidden until you link again. Your DiviGo account itself is not affected.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowUnlinkConfirm(false)}
                    style={{
                      padding: '0.5rem 1rem', fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4,
                      color: '#bab1a8', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitUnlink}
                    style={{
                      padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700,
                      background: '#b3324a', border: 'none', borderRadius: 4,
                      color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
