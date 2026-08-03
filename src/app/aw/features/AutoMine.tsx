'use client'

import { useState, useSyncExternalStore } from 'react'
import s from '../aw.module.css'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { subscribe, getState, solveMine, submitMine, loadFor } from '../lib/aw/mining'
import { useWax } from '../lib/aw/useWax'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const EXPLORER = 'https://waxblock.io/transaction/'

export default function AutoMine({ account }: FeatureProps) {
  const m = useSyncExternalStore(subscribe, getState, getState)
  const wax = useWax()
  const prices = usePrices()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ nonce: string; cooldown: number } | null>(null)
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})
  const usdSub = (amount: number) => { const v = usdFor('TLM', amount, prices); return v == null ? undefined : fmtUsd(v) }

  const signer = wax.signer || account
  const canSign = !!wax.signer

  // Step 1: solve (async). Step 2 (Confirm) signs inside the click so the
  // Cloud Wallet popup isn't blocked.
  const solve = async () => {
    if (!canSign) { wax.connect(); return }
    setBusy(true); setMsg({})
    try { loadFor(signer); setPending(await solveMine(signer)) }
    catch (e) { setMsg({ err: e instanceof Error ? e.message : 'failed' }) }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!pending) return
    setBusy(true); setMsg({})
    try {
      const tx = await submitMine(signer, pending.nonce, wax.submit)
      setMsg({ ok: `✓ Real mine landed on-chain — tx ${tx.slice(0, 12)}…` })
      loadFor(signer)
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : 'failed' }) }
    finally { setBusy(false); setPending(null) }
  }

  return (
    <>
      <PageHead title="Mine" desc="Real mining: solve the proof-of-work, then sign the mine on-chain. Earned TLM is measured from your actual balance." />

      {!m.powOk && <p className={s.err}>⚠ Proof-of-work self-test failed in this browser — mining is disabled.</p>}

      <Card title="Mine now" tag="real, on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>
          This signs a real <b>m.federation::mine</b> from your account. First <b>Solve</b> the proof-of-work, then <b>Confirm</b> to approve it in your wallet. (Two steps so the wallet popup opens correctly.)
        </p>
        {!account ? <Empty text="Load or connect a WAX account to begin." /> : (
          <div className={s.stubActions}>
            {!pending
              ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={solve} disabled={busy || !m.powOk}>{busy && m.status === 'solving' ? 'Solving…' : canSign ? 'Solve proof-of-work' : 'Connect wallet'}</button>
              : <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirm} disabled={busy}>{busy ? 'Signing…' : 'Confirm & sign mine ⛏️'}</button>}
          </div>
        )}
        {m.message && !msg.ok && !msg.err && <div className={s.msg} style={{ marginTop: 10 }}>{m.message}</div>}
        {msg.ok && <p className={s.ok} style={{ marginTop: 10 }}>{msg.ok}</p>}
        {msg.err && <p className={s.err} style={{ marginTop: 10 }}>⚠ {msg.err}</p>}
      </Card>

      <Card title="Hands-free auto-mining" tag="needs a mining key">
        <p className={s.empty}>
          MyCloudWallet signs every transaction with a popup, so it can&apos;t auto-mine unattended. The proper way (how AW miners do it) is a dedicated <b>mining permission + key</b> that can ONLY call <b>mine</b> — never move your funds — stored locally to sign in the background. Safe and truly hands-free. I can build that next if you want it.
        </p>
      </Card>

      {account && (
        <>
          <Card title="Rewards tracker" tag="real balance delta">
            <Grid>
              <Stat label="This session" value={`${m.sessionTlm.toFixed(4)} $TLM`} sub={usdSub(m.sessionTlm)} />
              <Stat label="Mines this session" value={`${m.mines}`} />
              <Stat label="Rate" value={`${m.ratePerHr.toFixed(2)} $TLM/hr`} />
              <Stat label="Status" value={m.status} />
            </Grid>
          </Card>

          <Card title="Recent mines" tag="on-chain">
            {m.events.length === 0 ? <Empty text="No mines yet — Solve then Confirm above." /> : (
              <div className={s.list}>
                {[...m.events].reverse().slice(0, 15).map((e, i) => (
                  <div key={i} className={s.logRow}>
                    <span>{time(e.ts)}</span>
                    <b>{e.reward > 0 ? `+${e.reward.toFixed(4)} $TLM` : 'mined'}</b>
                    <a href={`${EXPLORER}${e.tx}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--aww-primary)', textDecoration: 'none' }}>tx ↗</a>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}
