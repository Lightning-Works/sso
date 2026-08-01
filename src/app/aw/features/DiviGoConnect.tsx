'use client'

/**
 * DiviGo (Telegram) connection for AWW — WAX + TLM only.
 *
 * Reuses the SSO's existing, secure DiviGo backend verbatim (same-origin, same
 * Supabase session): /api/divigo/status, /link, /check-link, /balance,
 * /request-transfer, /check. DiviGo is custodial and holds the keys; a send
 * here just asks DiviGo to message the user on Telegram for approval, and only
 * moves funds after they tap approve. We never see a private key.
 *
 * No new backend code: 'wax' and 'tlm' are already in the balance EXTRA_COINS
 * and the transfer SENDABLE_COINS allowlists on the server.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { fmtCoin } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import s from '../aw.module.css'

type Status = { configured: boolean; verified: boolean; pending: boolean; link: { divigo_username: string | null; telegram_id: string | null } | null }
type Coin = 'wax' | 'tlm'

export default function DiviGoConnect() {
  const prices = usePrices()
  const [status, setStatus] = useState<Status | null>(null)
  const [balances, setBalances] = useState<Record<string, number> | null>(null)
  const [balMsg, setBalMsg] = useState('')

  // link flow
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkPhase, setLinkPhase] = useState<'idle' | 'waiting' | 'verified' | 'expired' | 'error'>('idle')
  const [linkErr, setLinkErr] = useState('')
  const linkTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // send flow
  const [coin, setCoin] = useState<Coin>('wax')
  const [amount, setAmount] = useState('')
  const [dest, setDest] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [sendCode, setSendCode] = useState<string | null>(null)
  const [sendDone, setSendDone] = useState(false)
  const sendTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const sendDeadline = useRef(0)

  const loadStatus = useCallback(async () => {
    try { setStatus(await (await fetch('/api/divigo/status', { cache: 'no-store' })).json()) }
    catch { setStatus(null) }
  }, [])
  const loadBalance = useCallback(async () => {
    setBalMsg('')
    try {
      const r = await fetch('/api/divigo/balance', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setBalances(j.balances || {})
      else setBalMsg(j.error === 'not_linked' ? '' : (j.error || 'Could not read balances'))
    } catch { setBalMsg('Could not read balances') }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { if (status?.verified) loadBalance() }, [status?.verified, loadBalance])
  useEffect(() => () => { if (linkTimer.current) clearInterval(linkTimer.current); if (sendTimer.current) clearInterval(sendTimer.current) }, [])

  const usd = (sym: string, n: number) => {
    const v = usdFor(sym.toUpperCase(), n, prices)
    return v == null ? undefined : fmtUsd(v)
  }

  // ── Link ──────────────────────────────────────────────────────────
  const startLink = async () => {
    setLinkBusy(true); setLinkErr(''); setLinkPhase('idle')
    try {
      const r = await fetch('/api/divigo/link', { method: 'POST' })
      const j = await r.json()
      if (!r.ok || !j.deepLink) { setLinkErr(j.error || 'Could not start linking'); setLinkBusy(false); return }
      window.open(j.deepLink, '_blank', 'noopener')
      setLinkPhase('waiting')
      if (linkTimer.current) clearInterval(linkTimer.current)
      const deadline = Date.now() + 10 * 60 * 1000
      const tick = async () => {
        try {
          const j2 = await (await fetch('/api/divigo/check-link', { cache: 'no-store' })).json()
          if (j2.status === 'verified') { clearInterval(linkTimer.current!); setLinkPhase('verified'); loadStatus() }
          else if (j2.status === 'expired' || Date.now() > deadline) { clearInterval(linkTimer.current!); setLinkPhase('expired') }
          else if (j2.status === 'error') { clearInterval(linkTimer.current!); setLinkPhase('error'); setLinkErr(j2.error || 'Link failed') }
        } catch { /* keep polling */ }
      }
      linkTimer.current = setInterval(tick, 2500); tick()
    } catch (e) { setLinkErr(e instanceof Error ? e.message : 'link failed') }
    finally { setLinkBusy(false) }
  }

  // ── Send (Telegram-approved) ──────────────────────────────────────
  const startSendPoll = (code: string) => {
    if (sendTimer.current) clearInterval(sendTimer.current)
    sendDeadline.current = Date.now() + 3 * 60 * 1000
    const tick = async () => {
      try {
        const j = await (await fetch(`/api/divigo/check?code=${encodeURIComponent(code)}`, { cache: 'no-store' })).json()
        if (j.status === 'completed') { clearInterval(sendTimer.current!); setSendDone(true); setSendCode(null); loadBalance(); return }
      } catch { /* keep trying */ }
      if (Date.now() > sendDeadline.current) { clearInterval(sendTimer.current!); setSendErr('No response yet — check Telegram, then refresh balances.'); setSendCode(null) }
    }
    sendTimer.current = setInterval(tick, 3000); tick()
  }
  const submitSend = async () => {
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { setSendErr('Enter an amount'); return }
    if (dest.trim().length < 1) { setSendErr('Enter a destination WAX account'); return }
    setSendBusy(true); setSendErr(''); setSendDone(false); setSendCode(null)
    try {
      const r = await fetch('/api/divigo/request-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin, amount: amt, destination: dest.trim().toLowerCase(), subject: `Send $${coin.toUpperCase()} from Alien Worlds Wallet` }),
      })
      const j = await r.json()
      if (!r.ok) setSendErr(j.error || `HTTP ${r.status}`)
      else if (j.code) { setSendCode(j.code); setAmount(''); startSendPoll(j.code) }
      else setSendErr('Unexpected response from DiviGo')
    } catch (e) { setSendErr(e instanceof Error ? e.message : 'send failed') }
    finally { setSendBusy(false) }
  }

  // ── Render ────────────────────────────────────────────────────────
  const configured = !!status?.configured
  const verified = !!status?.verified
  const waxBal = balances?.wax ?? 0
  const tlmBal = balances?.tlm ?? 0

  return (
    <div>
      <PageHead title="DiviGo (Telegram)" desc="Link your DiviGo account to use its $WAX and $TLM here. Sends are approved by tapping Confirm in Telegram — DiviGo holds the keys, so nothing moves without your OK." />

      {status && !configured && (
        <Card title="DiviGo" tag="setup pending">
          <Empty text="The DiviGo connection isn't switched on for this server yet (the DiviGo host + API key still need to be configured). The wallet UI is ready and will light up the moment that's set." />
        </Card>
      )}

      {configured && !verified && (
        <Card title="Link your DiviGo account" tag="one-time">
          <p className={s.empty} style={{ marginBottom: 12 }}>
            Tap the button, then in Telegram press <b>Start</b> in the DiviGo bot. This links your DiviGo wallet to Alien Worlds Wallet so your $WAX and $TLM appear here.
          </p>
          <div className={s.stubActions}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={startLink} disabled={linkBusy || linkPhase === 'waiting'}>
              {linkPhase === 'waiting' ? 'Waiting for Telegram…' : linkBusy ? 'Starting…' : 'Link DiviGo via Telegram'}
            </button>
          </div>
          {linkPhase === 'waiting' && <p className={s.ok} style={{ marginTop: 10 }}>Opened Telegram — press Start in the DiviGo bot. This page will update automatically.</p>}
          {linkPhase === 'expired' && <p className={s.err} style={{ marginTop: 10 }}>⚠ The link request expired. Tap the button to try again.</p>}
          {linkErr && <p className={s.err} style={{ marginTop: 10 }}>⚠ {linkErr}</p>}
        </Card>
      )}

      {verified && (
        <>
          <Card title="Your DiviGo Balances" tag="live read">
            <p className={s.empty} style={{ marginBottom: 10 }}>
              Linked{status?.link?.divigo_username ? ` as @${status.link.divigo_username}` : ''}. Held in DiviGo, spendable from here.
            </p>
            {!balances ? <Empty text="Reading balances…" /> : (
              <Grid>
                <Stat label="WAX" value={fmtCoin(waxBal, 'WAX')} sub={usd('WAX', waxBal)} />
                <Stat label="Trilium" value={fmtCoin(tlmBal, 'TLM')} sub={usd('TLM', tlmBal)} />
              </Grid>
            )}
            {balMsg && <p className={s.err} style={{ marginTop: 10 }}>⚠ {balMsg}</p>}
          </Card>

          <Card title="Send from DiviGo" tag="approve in Telegram">
            <p className={s.empty} style={{ marginBottom: 10 }}>Choose $WAX or $TLM, enter an amount and a destination WAX account. DiviGo will message you on Telegram to confirm before anything is sent.</p>
            <div className={s.formRow}>
              <select className={s.input} value={coin} onChange={e => setCoin(e.target.value as Coin)}>
                <option value="wax">$WAX</option>
                <option value="tlm">$TLM (Trilium)</option>
              </select>
            </div>
            <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder={`Amount of $${coin.toUpperCase()}`} value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            <div className={s.formRow}><input className={s.input} placeholder="Destination WAX account" value={dest} onChange={e => setDest(e.target.value)} /></div>
            <div className={s.stubActions}>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={submitSend} disabled={sendBusy || !!sendCode}>
                {sendBusy ? 'Requesting…' : sendCode ? 'Waiting for Telegram…' : `Send $${coin.toUpperCase()}`}
              </button>
            </div>
            {sendCode && <p className={s.ok} style={{ marginTop: 10 }}>Request sent — open Telegram and tap Confirm. Waiting for approval…</p>}
            {sendDone && <p className={s.ok} style={{ marginTop: 10 }}>✓ Approved and sent. Balances updated.</p>}
            {sendErr && <p className={s.err} style={{ marginTop: 10 }}>⚠ {sendErr}</p>}
          </Card>
        </>
      )}
    </div>
  )
}
