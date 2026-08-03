'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import s from '../aw.module.css'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { subscribe, getState, solveMine, submitMine, startReal, stop, loadFor } from '../lib/aw/mining'
import { hasMiningKey, checkMinePermission, generateMiningKey, buildSetupActions, buildRevokeActions, clearMiningKey } from '../lib/aw/miningKey'
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
  // hands-free setup state
  const [localKey, setLocalKey] = useState(false)
  const [onchain, setOnchain] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupMsg, setSetupMsg] = useState<{ ok?: string; err?: string }>({})

  const usdSub = (amount: number) => { const v = usdFor('TLM', amount, prices); return v == null ? undefined : fmtUsd(v) }
  const signer = wax.signer || account
  const canSign = !!wax.signer
  const keyReady = localKey && onchain

  useEffect(() => {
    if (!signer) { setLocalKey(false); setOnchain(false); return }
    setLocalKey(hasMiningKey(signer))
    checkMinePermission(signer).then(setOnchain).catch(() => setOnchain(false))
  }, [signer])

  // ---- manual single mine (wallet-signed): solve then confirm ----
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
    try { const tx = await submitMine(signer, pending.nonce, wax.submit); setMsg({ ok: `✓ Real mine landed — tx ${tx.slice(0, 12)}…` }); loadFor(signer) }
    catch (e) { setMsg({ err: e instanceof Error ? e.message : 'failed' }) }
    finally { setBusy(false); setPending(null) }
  }

  // ---- hands-free setup / start / remove ----
  const setup = async () => {
    if (!canSign) { wax.connect(); return }
    setSetupBusy(true); setSetupMsg({})
    try {
      const pub = await generateMiningKey(signer)
      await wax.submit(buildSetupActions(signer, pub))
      setLocalKey(true); setOnchain(true)
      setSetupMsg({ ok: '✓ Hands-free mining is set up. Press Start and it mines on its own — no more popups.' })
    } catch (e) { clearMiningKey(signer); setSetupMsg({ err: `Setup failed: ${e instanceof Error ? e.message : 'error'}` }) }
    finally { setSetupBusy(false) }
  }
  const remove = async () => {
    setSetupBusy(true); setSetupMsg({})
    try { await wax.submit(buildRevokeActions(signer)); clearMiningKey(signer); setLocalKey(false); setOnchain(false); setSetupMsg({ ok: 'Mining key removed on-chain and from this device.' }) }
    catch (e) { setSetupMsg({ err: e instanceof Error ? e.message : 'failed' }) }
    finally { setSetupBusy(false) }
  }
  const startAuto = () => { loadFor(signer); startReal(signer) }

  return (
    <>
      <PageHead title="Auto-Mine" desc="Real, hands-free mining: set up a mine-only key once, then it solves the proof-of-work and mines on its own — no popups." />

      {!m.powOk && <p className={s.err}>⚠ Proof-of-work self-test failed in this browser — mining is disabled.</p>}

      {/* Hands-free */}
      <Card title="Hands-free auto-mining" tag={keyReady ? (m.running ? 'running' : 'ready') : 'setup'}>
        {!account ? <Empty text="Load or connect a WAX account to begin." /> : !keyReady ? (
          <>
            <p className={s.empty} style={{ marginBottom: 10 }}>
              One-time setup adds a <b>mine-only key</b> to your account (a custom permission linked to just <b>m.federation::mine</b>). It <b>cannot move your funds</b> — only mine. Stored on this device so it signs in the background. You approve the setup once in your wallet, then mining runs with no popups. Remove it anytime.
            </p>
            <div className={s.stubActions}>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={setup} disabled={setupBusy || !m.powOk}>{setupBusy ? 'Setting up…' : canSign ? 'Set up hands-free mining' : 'Connect wallet'}</button>
            </div>
          </>
        ) : (
          <>
            {m.message && <div className={s.msg}>{m.running ? '⛏️ ' : ''}{m.message}</div>}
            <div className={s.stubActions} style={{ marginTop: 8, gap: 12 }}>
              {!m.running
                ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={startAuto} disabled={!m.powOk}>Start auto-mining</button>
                : <button className={`${s.btn} ${s.btnGhost}`} onClick={stop}>Stop</button>}
              {!m.running && <button className={s.btn} onClick={remove} disabled={setupBusy}>{setupBusy ? '…' : 'Remove mining key'}</button>}
            </div>
          </>
        )}
        {setupMsg.ok && <p className={s.ok} style={{ marginTop: 10 }}>{setupMsg.ok}</p>}
        {setupMsg.err && <p className={s.err} style={{ marginTop: 10 }}>⚠ {setupMsg.err}</p>}
      </Card>

      {/* Manual single mine (wallet) */}
      {account && (
        <Card title="Mine once (wallet-signed)" tag="manual">
          <p className={s.empty} style={{ marginBottom: 10 }}>Prefer to approve each mine yourself? Solve, then Confirm to sign one mine in your wallet.</p>
          <div className={s.stubActions}>
            {!pending
              ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={solve} disabled={busy || !m.powOk}>{busy && m.status === 'solving' ? 'Solving…' : canSign ? 'Solve proof-of-work' : 'Connect wallet'}</button>
              : <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirm} disabled={busy}>{busy ? 'Signing…' : 'Confirm & sign mine ⛏️'}</button>}
          </div>
          {msg.ok && <p className={s.ok} style={{ marginTop: 10 }}>{msg.ok}</p>}
          {msg.err && <p className={s.err} style={{ marginTop: 10 }}>⚠ {msg.err}</p>}
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
            {m.events.length === 0 ? <Empty text="No mines yet." /> : (
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
