'use client'

import { useState, useSyncExternalStore } from 'react'
import s from '../aw.module.css'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { subscribe, getState, startReal, stop, mineOnce, loadFor } from '../lib/aw/mining'
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
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ ok?: string; err?: string }>({})
  const usdSub = (amount: number) => { const v = usdFor('TLM', amount, prices); return v == null ? undefined : fmtUsd(v) }

  const signer = wax.signer || account
  const canSign = !!wax.signer

  const verify = async () => {
    if (!canSign) { wax.connect(); return }
    setVerifying(true); setVerifyMsg({})
    try {
      loadFor(signer)
      const tx = await mineOnce(signer, wax.submit)
      setVerifyMsg({ ok: `✓ Real mine landed on-chain — tx ${tx.slice(0, 12)}…. Auto-mining is safe to start.` })
    } catch (e) {
      setVerifyMsg({ err: `Mine failed: ${e instanceof Error ? e.message : 'error'}. If it mentions proof-of-work/difficulty, your account may need a different setting — tell me and I'll adjust.` })
    } finally { setVerifying(false) }
  }

  const start = () => { if (!canSign) { wax.connect(); return } loadFor(signer); startReal(signer, wax.submit) }

  return (
    <>
      <PageHead title="Auto-Mine" desc="Real, automatic mining: solve the proof-of-work, sign the mine on-chain, repeat each cooldown. Earned TLM is measured from your actual balance." />

      {!m.powOk && <p className={s.err}>⚠ Proof-of-work self-test failed in this browser — mining is disabled to avoid submitting invalid transactions.</p>}

      <Card title="Before you start" tag="one-time check">
        <p className={s.empty} style={{ marginBottom: 10 }}>
          This signs real <b>m.federation::mine</b> transactions from your account and uses your CPU/NET. First, do a single <b>Mine once</b> to confirm it lands on-chain. For hands-free running afterward, enable <b>auto-accept</b> in MyCloudWallet so it signs without a popup each cycle.
        </p>
        {!account ? <Empty text="Load or connect a WAX account to begin." /> : (
          <div className={s.stubActions}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={verify} disabled={verifying || !m.powOk}>
              {verifying ? 'Mining…' : canSign ? 'Mine once (verify)' : 'Connect wallet'}
            </button>
          </div>
        )}
        {verifyMsg.ok && <p className={s.ok} style={{ marginTop: 10 }}>{verifyMsg.ok}</p>}
        {verifyMsg.err && <p className={s.err} style={{ marginTop: 10 }}>⚠ {verifyMsg.err}</p>}
      </Card>

      {account && (
        <Card title="Auto-miner" tag={m.running ? 'running' : 'idle'}>
          {m.message && <div className={s.msg}>{m.running ? '⛏️ ' : ''}{m.message}</div>}
          <div className={s.stubActions} style={{ marginTop: 8 }}>
            {!m.running
              ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={start} disabled={!m.powOk}>{canSign ? 'Start auto-mining' : 'Connect wallet'}</button>
              : <button className={`${s.btn} ${s.btnGhost}`} onClick={stop}>Stop</button>}
          </div>
        </Card>
      )}

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
            {m.events.length === 0 ? <Empty text="No mines yet — run 'Mine once' or start the auto-miner." /> : (
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
