'use client'

/**
 * DiviGoWalletPanel — the bottom block on /wallet/divi.
 *
 * Linking flow uses Telegram's `?start=` deep-link pattern: we issue a
 * pending token, open `t.me/DiviGoBot?start=lwsso_<token>`, and DiviGo's
 * bot POSTs to /api/divigo/link-callback when the user taps Start. We
 * poll /api/divigo/status every 2s while the modal is open and close it
 * the moment verified_at appears.
 *
 * Three user states are handled:
 *   A. Has DiviGo + Telegram          → primary "Link" button + QR modal
 *   B. Has Telegram, no DiviGo        → "Don't have DiviGo?" button → opens
 *                                        @DiviGoBot for in-Telegram signup
 *   C. No Telegram at all             → expandable section with install
 *                                        links (iOS / Android / Desktop)
 *
 * Send/balance panel below stays mounted but greyed (visible, disabled)
 * when the link isn't verified yet, per the project rule of building the
 * full intended UI rather than gating it behind caution.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface StatusResponse {
  configured: boolean
  projectName: string | null
  linked: boolean       // synonymous with verified — only true after bot callback
  verified: boolean
  pending: boolean      // unverified token still alive — drives "waiting" modal
  link: {
    divigo_number: string | null
    divigo_route: string | null
    divigo_username: string | null
    telegram_id: string | null
    linked_at: string
    last_verified_at: string | null
  } | null
}

// Coins DiviGo's `balance` method iterates when coin='all'.
const SUPPORTED_COINS = ['divi', 'btc', 'eth', 'ltc', 'doge', 'core'] as const
const COIN_LABEL: Record<string, string> = {
  divi: 'DIVI', btc: 'BTC', eth: 'ETH', ltc: 'LTC', doge: 'DOGE', core: 'CORE',
}

const DIVIGO_BOT_HANDLE = 'DiviGoBot'  // mirror of server-side constant
const TELEGRAM_BLUE = '#229ED9'        // brand color for "Open Telegram" CTA

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

// External QR generator. Encodes the t.me deep-link URL (non-sensitive: the
// embedded token is single-use and expires server-side in 10 min). Using a
// public service avoids adding a QR library + bundle size; the only data
// sent off-platform is the t.me URL itself, which is fine.
function qrUrl(data: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`
}

export function DiviGoWalletPanel({ userId, diviPrice }: { userId: string | null; diviPrice: number }) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [balances, setBalances] = useState<Record<string, number> | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Link flow
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkDeepLink, setLinkDeepLink] = useState<string | null>(null)
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkStarting, setLinkStarting] = useState(false)
  // We optimistically detect verification by polling /status; flag locally
  // so the modal can flash a success state for a second before closing.
  const [linkVerifiedFlash, setLinkVerifiedFlash] = useState(false)
  const [showTelegramHelp, setShowTelegramHelp] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const linkPollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Send flow
  const [sendCoin, setSendCoin] = useState('divi')
  const [sendAmount, setSendAmount] = useState('')
  const [sendDest, setSendDest] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<unknown>(null)
  const sendPollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const sendPollDeadline = useRef<number>(0)
  const [sendPollExpired, setSendPollExpired] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/divigo/status', { cache: 'no-store' })
      const j: StatusResponse = await r.json()
      setStatus(j)
      return j
    } catch { return null }
  }, [])

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true); setBalanceError(null)
    try {
      const r = await fetch('/api/divigo/balance', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) {
        setBalances(null)
        setBalanceError(j.error === 'not_configured' ? 'API key not configured on server'
          : j.error === 'not_linked' ? null
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
    if (status?.verified && status?.configured) loadBalance()
    else { setBalances(null); setBalanceError(null) }
  }, [status?.verified, status?.configured, loadBalance])

  // Link-flow polling — runs while the modal is open, looking for the
  // verified_at flip caused by the bot callback. 2s cadence is the right
  // tradeoff: feels responsive without hammering the server.
  const stopLinkPolling = useCallback(() => {
    if (linkPollTimer.current) { clearInterval(linkPollTimer.current); linkPollTimer.current = null }
  }, [])
  useEffect(() => () => stopLinkPolling(), [stopLinkPolling])

  const startLinkFlow = async () => {
    setLinkStarting(true); setLinkError(null); setLinkVerifiedFlash(false)
    try {
      const r = await fetch('/api/divigo/link', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setLinkError(j.error || `HTTP ${r.status}`); setLinkStarting(false); return }
      setLinkDeepLink(j.deepLink)
      setLinkExpiresAt(j.expiresAt)
      setLinkModalOpen(true)
      // Begin polling. Use the inline tick so we don't depend on stopLinkPolling
      // changing identity (it would re-trigger this effect).
      stopLinkPolling()
      const tick = async () => {
        const s = await loadStatus()
        if (s?.verified) {
          stopLinkPolling()
          setLinkVerifiedFlash(true)
          setTimeout(() => { setLinkModalOpen(false); setLinkVerifiedFlash(false) }, 1500)
        } else if (s && !s.pending) {
          // Token expired before they confirmed — leave the modal open so the
          // user can retry. They'll see the "Link expired" message below.
          stopLinkPolling()
        }
      }
      linkPollTimer.current = setInterval(tick, 2000)
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e))
    }
    setLinkStarting(false)
  }

  const closeLinkModal = () => {
    stopLinkPolling()
    setLinkModalOpen(false)
    setLinkDeepLink(null)
    setLinkExpiresAt(null)
    setLinkError(null)
    setLinkVerifiedFlash(false)
  }

  const submitUnlink = async () => {
    setShowUnlinkConfirm(false)
    try {
      await fetch('/api/divigo/unlink', { method: 'POST' })
      setBalances(null)
      setSendCode(null); setSendResult(null); setSendError(null)
      await loadStatus()
    } catch { /* */ }
  }

  // Send flow (unchanged from before — just lives below the link UX)
  const stopSendPolling = useCallback(() => {
    if (sendPollTimer.current) { clearInterval(sendPollTimer.current); sendPollTimer.current = null }
  }, [])
  useEffect(() => () => stopSendPolling(), [stopSendPolling])

  const startSendPolling = useCallback((code: string) => {
    stopSendPolling()
    sendPollDeadline.current = Date.now() + 3 * 60 * 1000
    setSendPollExpired(false)
    const tick = async () => {
      try {
        const r = await fetch(`/api/divigo/check?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
        const j = await r.json()
        if (j.status === 'completed') {
          setSendResult(j.completed ?? true)
          stopSendPolling()
          loadBalance()
          return
        }
      } catch { /* keep trying */ }
      if (Date.now() > sendPollDeadline.current) {
        setSendPollExpired(true)
        stopSendPolling()
      }
    }
    sendPollTimer.current = setInterval(tick, 3000)
    tick()
  }, [stopSendPolling, loadBalance])

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
      else if (j.code) { setSendCode(j.code); startSendPolling(j.code) }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    }
    setSendBusy(false)
  }

  const dismissSendFlow = () => {
    stopSendPolling()
    setSendCode(null); setSendResult(null); setSendError(null); setSendPollExpired(false)
    setSendAmount(''); setSendDest(''); setSendSubject('')
  }

  // ── Render ──────────────────────────────────────────────────────────

  const configured = !!status?.configured
  const verified = !!status?.verified
  const canSend = !!userId && configured && verified && !sendCode && !sendResult

  const headerBadge = !configured
    ? { text: 'Inactive — no API key', color: 'var(--lw-text-muted)', border: 'rgba(255,255,255,0.15)' }
    : !verified
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
          {/* ─── Link choices (when not yet verified) ─────────────────── */}
          {!verified && (
            <div style={panelStyle({ padding: '1rem', marginBottom: '0.75rem' })}>
              <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.45 }}>
                Connect your DiviGo account to see your balance and send crypto. Every transaction needs
                your approval in Telegram — we only ask, we never hold your keys.
              </p>

              {/* Flow A — has DiviGo + Telegram */}
              <button
                onClick={startLinkFlow}
                disabled={linkStarting}
                style={{
                  width: '100%', padding: '0.7rem 1rem',
                  background: TELEGRAM_BLUE, color: '#fff',
                  border: 'none', borderRadius: 6,
                  fontSize: '0.95rem', fontWeight: 700,
                  cursor: linkStarting ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span aria-hidden style={{ fontSize: '1.05rem' }}>✈</span>
                {linkStarting ? 'Starting…' : 'Link my DiviGo account via Telegram'}
              </button>

              {linkError && (
                <p style={{ color: 'var(--lw-error)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{linkError}</p>
              )}

              {/* Flow B — has Telegram, no DiviGo */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <a
                  href={`https://t.me/${DIVIGO_BOT_HANDLE}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1, minWidth: '200px',
                    padding: '0.5rem 0.75rem', textAlign: 'center',
                    background: 'rgba(255,255,255,0.06)', color: 'var(--lw-text-secondary)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                    fontSize: '0.82rem', textDecoration: 'none',
                  }}
                >
                  Don&apos;t have DiviGo? → Sign up with @DiviGoBot
                </a>
                <button
                  onClick={() => setShowTelegramHelp(s => !s)}
                  style={{
                    flex: 1, minWidth: '200px',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.06)', color: 'var(--lw-text-secondary)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  Don&apos;t have Telegram? {showTelegramHelp ? '▴' : '▾'}
                </button>
              </div>

              {/* Flow C — no Telegram */}
              {showTelegramHelp && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem 0.85rem',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  color: 'var(--lw-text-secondary)', fontSize: '0.8rem', lineHeight: 1.45,
                }}>
                  <p style={{ margin: '0 0 0.5rem' }}>
                    Install Telegram first, then come back here:
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <a href="https://apps.apple.com/app/telegram-messenger/id686449807" target="_blank" rel="noopener noreferrer"
                       className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.78rem', textDecoration: 'none' }}>
                      iOS
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=org.telegram.messenger" target="_blank" rel="noopener noreferrer"
                       className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.78rem', textDecoration: 'none' }}>
                      Android
                    </a>
                    <a href="https://desktop.telegram.org/" target="_blank" rel="noopener noreferrer"
                       className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.78rem', textDecoration: 'none' }}>
                      Desktop
                    </a>
                    <a href="https://web.telegram.org/" target="_blank" rel="noopener noreferrer"
                       className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.78rem', textDecoration: 'none' }}>
                      Web (no install)
                    </a>
                  </div>
                  <p style={{ margin: '0.6rem 0 0', color: 'var(--lw-text-muted)', fontSize: '0.72rem' }}>
                    Telegram Web works right in your browser — no app install needed if you&apos;d rather not.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── Linked-account summary ──────────────────────────────── */}
          {verified && status.link && (() => {
            const username = status.link.divigo_username
            const display = username ? `@${username}` : (status.link.divigo_number || '—')
            const ROUTE_LABEL: Record<string, string> = {
              telegram: 'Telegram', telegramLaunchGoat: 'Telegram',
              wa: 'WhatsApp', whatsapp: 'WhatsApp', botmaker: 'WhatsApp',
              meta: 'Messenger', signal: 'Signal',
            }
            const routeLabel = status.link.divigo_route ? (ROUTE_LABEL[status.link.divigo_route] || status.link.divigo_route) : '—'
            return (
              <div style={panelStyle({ padding: '0.7rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>Linked DiviGo account</div>
                  <div style={{ color: 'var(--lw-text-white)', fontSize: '0.9rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {display}
                    <span style={{ color: 'var(--lw-text-muted)', marginLeft: '0.5rem', fontFamily: 'inherit' }}>
                      via {routeLabel}
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
            )
          })()}

          {/* ─── Balance block ───────────────────────────────────────── */}
          <div style={panelStyle({ padding: '1rem', marginBottom: '0.75rem', opacity: verified && configured ? 1 : 0.5 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                DiviGo balances
              </span>
              {verified && configured && (
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
                {verified && configured ? 'Loading…' : '— · — · —'}
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

          {/* ─── Send panel ──────────────────────────────────────────── */}
          <div style={panelStyle({ padding: '1rem', opacity: canSend || sendCode ? 1 : 0.5 })}
               aria-disabled={!canSend && !sendCode ? 'true' : undefined}>
            <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
              Send crypto from DiviGo
            </div>

            {!sendCode && !sendResult ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select value={sendCoin} onChange={e => setSendCoin(e.target.value)} disabled={!canSend || sendBusy} style={inputStyle}>
                    {SUPPORTED_COINS.map(c => <option key={c} value={c}>{COIN_LABEL[c]}</option>)}
                  </select>
                  <input type="text" inputMode="decimal" value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                    placeholder="Amount" disabled={!canSend || sendBusy} style={inputStyle} />
                </div>
                <input type="text" value={sendDest} onChange={e => setSendDest(e.target.value)}
                  placeholder="Destination address" disabled={!canSend || sendBusy}
                  style={{ ...inputStyle, width: '100%', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
                <input type="text" value={sendSubject} onChange={e => setSendSubject(e.target.value)}
                  placeholder="Note (optional, shown in approval prompt)" disabled={!canSend || sendBusy}
                  style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
                {sendError && <p style={{ color: 'var(--lw-error)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{sendError}</p>}
                <button onClick={submitSend} className="lw-btn lw-btn-primary"
                  disabled={!canSend || sendBusy || !sendAmount.trim() || !sendDest.trim()}
                  style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
                  {sendBusy ? 'Requesting…' : 'Request send'}
                </button>
              </>
            ) : sendResult ? (
              <div>
                <p style={{ color: '#2ea043', fontWeight: 600, margin: '0 0 0.5rem' }}>Approval received from DiviGo.</p>
                <pre style={{ background: 'rgba(0,0,0,0.4)', color: '#bab1a8', padding: '0.6rem', borderRadius: 4, fontSize: '0.75rem', overflowX: 'auto', margin: '0 0 0.75rem', maxHeight: '180px' }}>
                  {typeof sendResult === 'object' ? JSON.stringify(sendResult, null, 2) : String(sendResult)}
                </pre>
                <button onClick={dismissSendFlow} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.4rem 1.2rem' }}>Done</button>
              </div>
            ) : (
              <div>
                <p style={{ color: 'var(--lw-text-white)', margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                  Open <strong>Telegram</strong> and approve the request.
                </p>
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                  Request code: <code style={{ background: 'rgba(0,0,0,0.4)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>{sendCode}</code>
                </p>
                {sendPollExpired ? (
                  <p style={{ color: '#f0b85a', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                    Polling timed out after 3 minutes. The request may still be valid — check Telegram, or dismiss and try again.
                  </p>
                ) : (
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                    Waiting for approval… <span style={{ opacity: 0.7 }}>(checking every 3s)</span>
                  </p>
                )}
                <button onClick={dismissSendFlow}
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--lw-text-secondary)', border: 'none', borderRadius: 4, padding: '0.4rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ─── Link modal — QR + deep link, polls for verification ─── */}
          {linkModalOpen && linkDeepLink && typeof document !== 'undefined' && createPortal(
            <div onClick={closeLinkModal}
              style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: '#1a1a2e', border: `1px solid ${TELEGRAM_BLUE}55`, borderRadius: 12, padding: '1.5rem', minWidth: 'min(420px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                {linkVerifiedFlash ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <div style={{ fontSize: '3rem', color: '#2ea043', marginBottom: '0.5rem' }}>✓</div>
                    <h3 style={{ color: '#fff', margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>Linked!</h3>
                    <p style={{ color: '#bab1a8', fontSize: '0.85rem', margin: 0 }}>Your DiviGo wallet is ready.</p>
                  </div>
                ) : (
                  <>
                    <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span aria-hidden style={{ color: TELEGRAM_BLUE, fontSize: '1.2rem' }}>✈</span>
                      Confirm in Telegram
                    </h3>
                    <p style={{ color: '#e4dad1', fontSize: '0.88rem', margin: '0 0 1rem', lineHeight: 1.45 }}>
                      Open the DiviGo bot and tap <strong>Start</strong>. Your wallet will link automatically — usually within a couple of seconds.
                    </p>

                    <a href={linkDeepLink} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', textAlign: 'center', width: '100%', padding: '0.7rem 1rem',
                        background: TELEGRAM_BLUE, color: '#fff', border: 'none', borderRadius: 6,
                        fontSize: '0.95rem', fontWeight: 700, textDecoration: 'none',
                        boxSizing: 'border-box', marginBottom: '1rem' }}>
                      Open Telegram
                    </a>

                    <div style={{ textAlign: 'center', color: 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
                      — or scan with your phone —
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrUrl(linkDeepLink, 220)} width={220} height={220} alt="Scan with Telegram on your phone"
                        style={{ background: '#fff', padding: 8, borderRadius: 6 }} />
                    </div>

                    <div style={{ textAlign: 'center', color: 'var(--lw-text-muted)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                      {status?.pending
                        ? <>Waiting for confirmation… <span style={{ opacity: 0.7 }}>(checking every 2s)</span></>
                        : <>Link expired — close this and start over.</>}
                    </div>
                    {linkExpiresAt && status?.pending && (
                      <div style={{ textAlign: 'center', color: 'var(--lw-text-muted)', fontSize: '0.7rem', marginBottom: '0.75rem' }}>
                        Expires {new Date(linkExpiresAt).toLocaleTimeString()}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={closeLinkModal}
                        style={{ padding: '0.4rem 1rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4, color: '#bab1a8', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )}

          {/* ─── Unlink confirmation modal ───────────────────────────── */}
          {showUnlinkConfirm && typeof document !== 'undefined' && createPortal(
            <div onClick={() => setShowUnlinkConfirm(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: '#1a1a2e', border: '1px solid rgba(255,68,68,0.4)', borderRadius: 12, padding: '1.25rem', minWidth: 'min(380px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                <h3 style={{ color: '#fff', margin: '0 0 0.6rem', fontSize: '1rem', fontWeight: 700 }}>Unlink DiviGo?</h3>
                <p style={{ color: '#e4dad1', margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  Your DiviGo balance and send panel will be hidden until you link again. Your DiviGo account itself is not affected.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowUnlinkConfirm(false)}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4, color: '#bab1a8', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={submitUnlink}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700, background: '#b3324a', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>
                    Unlink
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  )
}
