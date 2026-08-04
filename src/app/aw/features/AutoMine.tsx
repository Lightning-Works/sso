'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import s from '../aw.module.css'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { MiningChart, autoBucket, type Bucket } from '../ui/charts'
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
  // Recent-mines view: chart (default) vs list; chart bucket (null = auto/all-time)
  const [mineTab, setMineTab] = useState<'chart' | 'list'>('chart')
  const [userBucket, setUserBucket] = useState<Bucket | null>(null)
  const bucket = userBucket ?? autoBucket(m.events)

  const usdSub = (amount: number) => { const v = usdFor('TLM', amount, prices); return v == null ? undefined : fmtUsd(v) }
  const usdTxt = (amount: number) => { const v = usdFor('TLM', amount, prices); return v == null ? '' : ` (= ${fmtUsd(v)})` }
  const signer = wax.signer || account
  const canSign = !!wax.signer
  const keyReady = localKey && onchain

  // Live 1s tick for the countdown while running.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!m.running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [m.running])
  const hms = (secs: number) => {
    const s = Math.max(0, Math.floor(secs)), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60
    return `${h}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`
  }
  const MiningIcon = ({ animate = false }: { animate?: boolean }) => (
    <span className={`${s.miningIcon} ${animate ? s.miningIconAnim : ''}`} style={{ marginRight: 7 }}>
      <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <path d="M3 8 Q12 1.5 21 8" />
        <path d="M12 6 L12 22" />
      </svg>
    </span>
  )

  // Load this account's saved mining history on open, so the chart shows it.
  useEffect(() => { if (signer && !getState().running) loadFor(signer) }, [signer])

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
      <PageHead title="Auto-Mine" desc={<>Set up a <b style={{ color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 45%, #fff)', fontWeight: 700 }}>mine-only key</b> once and it mines automatically for you.</>} />

      {!m.powOk && <p className={s.err}>⚠ Proof-of-work self-test failed in this browser — mining is disabled.</p>}

      {/* Hands-free */}
      <div className={s.chartRow}>
        <Card title="Hands-free auto-mining" tag={keyReady ? (m.running ? 'running' : 'ready') : 'setup'} style={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            {!account ? <Empty text="Load or connect a WAX account to begin." /> : !keyReady ? (
              <>
                <p className={s.empty} style={{ marginBottom: 10 }}>
                  One-time setup adds a <b>mine-only key</b> to your account (a custom permission linked to just <b>m.federation::mine</b>). It <b>cannot move your funds</b>, only mine. Stored on this device so it signs in the background. You approve the setup once in your wallet, then mining runs with no popups. Remove it anytime.
                </p>
                <div className={s.stubActions}>
                  <button className={`${s.btn} ${s.btnPrimary}`} onClick={setup} disabled={setupBusy || !m.powOk}>{setupBusy ? 'Setting up…' : canSign ? 'Set up hands-free mining' : 'Connect wallet'}</button>
                </div>
              </>
            ) : (
              <>
                {(() => {
                  const remaining = m.nextMineAt ? Math.max(0, (m.nextMineAt - now) / 1000) : 0
                  const active = m.status === 'solving' || m.status === 'submitting'
                  if (m.status === 'error') return <div className={s.msg} style={{ color: 'var(--aww-danger, #ff6b6b)' }}><MiningIcon /> {m.message}</div>
                  if (m.running && active) return <div className={s.msg}><MiningIcon animate /> {m.message || 'Mining now…'}{m.mines > 0 ? ` · ${m.mines} mine${m.mines === 1 ? '' : 's'} so far` : ''}</div>
                  if (m.running && m.nextMineAt && remaining > 0) return <div className={s.msg}><MiningIcon /> Waiting · {m.mines} mine{m.mines === 1 ? '' : 's'} this session{m.sessionTlm > 0 ? ` · ${m.sessionTlm.toFixed(4)} $TLM` : ''}. Next mine in {hms(remaining)}</div>
                  if (m.running) return <div className={s.msg}><MiningIcon animate /> Starting…</div>
                  return m.message ? <div className={s.msg}>{m.message}</div> : null
                })()}
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
          </div>
          <img src="/aww/bot-miner.webp" alt="Auto-miner bot" style={{ width: '100%', marginTop: 14, borderRadius: 8, display: 'block' }} />
        </Card>

        {/* Manual single mine (wallet) */}
        {account && (
          <Card title="Mine once (wallet-signed)" tag="manual" style={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <p className={s.empty} style={{ marginBottom: 10 }}>Prefer to approve each mine yourself? Press Mine, then Confirm to sign one mine in your wallet.</p>
              <div className={s.stubActions}>
                {!pending
                  ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={solve} disabled={busy || !m.powOk}>{busy && m.status === 'mining' ? 'Mining…' : canSign ? 'Mine' : 'Connect wallet'}</button>
                  : <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirm} disabled={busy}>{busy ? 'Signing…' : 'Confirm & sign mine ⛏️'}</button>}
              </div>
              {msg.ok && <p className={s.ok} style={{ marginTop: 10 }}>{msg.ok}</p>}
              {msg.err && <p className={s.err} style={{ marginTop: 10 }}>⚠ {msg.err}</p>}
            </div>
            <img src="/aww/miner.webp" alt="Trilium miner" style={{ width: '100%', marginTop: 14, borderRadius: 8, display: 'block' }} />
          </Card>
        )}
      </div>

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

          <Card title="Your mining" tag="on-chain">
            {/* One row: [Chart List]  gap  [Hourly Daily Weekly All-time] — compact */}
            {(() => {
              const tb = (active: boolean) => `${s.btn} ${active ? s.btnPrimary : ''}`
              const st = { padding: '5px 12px', fontSize: 11 } as const
              return (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setMineTab('chart')} className={tb(mineTab === 'chart')} style={st}>Chart</button>
                  <button onClick={() => setMineTab('list')} className={tb(mineTab === 'list')} style={st}>List</button>
                  {mineTab === 'chart' && (
                    <>
                      <span style={{ width: 34, display: 'inline-block' }} />
                      <button onClick={() => setUserBucket('hour')} className={tb(bucket === 'hour')} style={st}>Hourly</button>
                      <button onClick={() => setUserBucket('day')} className={tb(bucket === 'day')} style={st}>Daily</button>
                      <button onClick={() => setUserBucket('week')} className={tb(bucket === 'week')} style={st}>Weekly</button>
                      <button onClick={() => setUserBucket(null)} className={tb(userBucket === null)} style={st}>All-time</button>
                    </>
                  )}
                </div>
              )
            })()}

            {m.events.length === 0 ? <Empty text="No mines yet — start mining and it'll chart here." /> : mineTab === 'chart' ? (
              <MiningChart events={m.events} bucket={bucket} />
            ) : (
              <div className={s.list}>
                {[...m.events].reverse().slice(0, 30).map((e, i) => (
                  <div key={i} className={s.logRow}>
                    <span>{time(e.ts)}</span>
                    <b>{e.reward > 0 ? `+${e.reward.toFixed(4)} $TLM${usdTxt(e.reward)}` : 'mined'}</b>
                    <a href={`${EXPLORER}${e.tx}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--aww-text-dim)', textDecoration: 'none' }}>verify ↗</a>
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
