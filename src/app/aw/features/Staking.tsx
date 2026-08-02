'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { fmt, fmtCoin } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import { useWax } from '../lib/aw/useWax'
import { fetchWaxResources, waxAsset, type WaxResources } from '../lib/aw/waxAccount'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

// A well-known WAX staking-reward proxy, pre-filled so a user can start
// earning rewards in one click. They can replace it with any proxy they trust.
const DEFAULT_PROXY = 'proxy4nation'

// Buffer we keep staked so transactions are always covered. WAX is cheap, so
// this is a few pennies of headroom — the point is the user never runs dry.
const TARGET_CPU_WAX = 10
const TARGET_NET_WAX = 2
const ADD_CPU_WAX = 5
const ADD_NET_WAX = 1

const pct = (used: number, max: number) => (max > 0 ? Math.min(100, (used / max) * 100) : 0)
// Free headroom as a %, 0 when nothing is staked (so the meter reads empty/red).
const headroom = (used: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (1 - used / max) * 100)) : 0)
// Smooth green (120°) → yellow → orange → red (0°) by health.
const meterColor = (h: number) => `hsl(${Math.round(h * 1.2)} 80% 46%)`
const meterWord = (h: number) => (h >= 60 ? 'Covered' : h >= 35 ? 'Getting low' : h >= 15 ? 'Low' : 'Very low')

// Colored health bar for one resource.
function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const h = headroom(used, max)
  const c = meterColor(h)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: 'var(--aww-text-dim)' }}>
        <span>{label}</span>
        <span style={{ color: c, fontWeight: 700 }}>{h.toFixed(0)}% · {meterWord(h)}</span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: 'color-mix(in srgb, var(--aww-text-muted) 22%, transparent)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(3, h)}%`, background: c, transition: 'width .5s ease, background .5s ease' }} />
      </div>
    </div>
  )
}

export default function Staking({ account }: FeatureProps) {
  const prices = usePrices()
  const wax = useWax()
  const [res, setRes] = useState<WaxResources | null>(null)
  const [stakeCpu, setStakeCpu] = useState('')
  const [stakeNet, setStakeNet] = useState('')
  const [unCpu, setUnCpu] = useState('')
  const [unNet, setUnNet] = useState('')
  const [proxy, setProxy] = useState(DEFAULT_PROXY)
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})
  const [busy, setBusy] = useState('')

  const usd = (n: number) => {
    const v = usdFor('WAX', n, prices)
    return v == null ? undefined : fmtUsd(v)
  }

  const reload = useCallback(() => {
    if (!account) { setRes(null); return }
    fetchWaxResources(account).then(setRes).catch(() => setRes(null))
  }, [account])
  useEffect(() => { reload() }, [reload])

  const signer = wax.signer
  const run = async (key: string, actions: Parameters<typeof wax.submit>[0], okMsg: string) => {
    if (!signer) return
    setBusy(key); setMsg({})
    try {
      const r = await wax.submit(actions)
      setMsg({ ok: `${okMsg} — tx ${r.transaction_id?.slice(0, 10) ?? 'sent'}…` })
      setStakeCpu(''); setStakeNet(''); setUnCpu(''); setUnNet('')
      setTimeout(reload, 1500)
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : `${key} failed` })
    } finally { setBusy('') }
  }

  // Top-up buffer maths.
  const needCpu = Math.max(0, TARGET_CPU_WAX - (res?.cpuStaked ?? 0))
  const needNet = Math.max(0, TARGET_NET_WAX - (res?.netStaked ?? 0))
  const needTopUp = needCpu > 0.0001 || needNet > 0.0001
  const topUpWax = needCpu + needNet

  const doTopUp = () => run('topup', [{
    account: 'eosio', name: 'delegatebw', authorization: wax.auth(),
    data: { from: signer, receiver: signer, stake_net_quantity: waxAsset(needNet), stake_cpu_quantity: waxAsset(needCpu), transfer: false },
  }], 'Topped up — your transactions are covered')

  const doAddMore = () => run('topup', [{
    account: 'eosio', name: 'delegatebw', authorization: wax.auth(),
    data: { from: signer, receiver: signer, stake_net_quantity: waxAsset(ADD_NET_WAX), stake_cpu_quantity: waxAsset(ADD_CPU_WAX), transfer: false },
  }], 'Added more headroom')

  const doStake = () => {
    const c = parseFloat(stakeCpu) || 0, n = parseFloat(stakeNet) || 0
    if (c <= 0 && n <= 0) { setMsg({ err: 'Enter a CPU and/or NET amount to stake' }); return }
    run('stake', [{
      account: 'eosio', name: 'delegatebw', authorization: wax.auth(),
      data: { from: signer, receiver: signer, stake_net_quantity: waxAsset(n), stake_cpu_quantity: waxAsset(c), transfer: false },
    }], 'Staked')
  }
  const doUnstake = () => {
    const c = parseFloat(unCpu) || 0, n = parseFloat(unNet) || 0
    if (c <= 0 && n <= 0) { setMsg({ err: 'Enter a CPU and/or NET amount to unstake' }); return }
    run('unstake', [{
      account: 'eosio', name: 'undelegatebw', authorization: wax.auth(),
      data: { from: signer, receiver: signer, unstake_net_quantity: waxAsset(n), unstake_cpu_quantity: waxAsset(c) },
    }], 'Unstake started (72h refund)')
  }
  const doVote = () => {
    const p = proxy.trim().toLowerCase()
    if (!p) { setMsg({ err: 'Enter a proxy account to vote for' }); return }
    run('vote', [{
      account: 'eosio', name: 'voteproducer', authorization: wax.auth(),
      data: { voter: signer, proxy: p, producers: [] },
    }], `Voting for ${p}`)
  }
  const doClaim = () => run('claim', [{
    account: 'eosio', name: 'claimgbmvote', authorization: wax.auth(),
    data: { owner: signer },
  }], 'Rewards claimed')

  // Connect-or-sign button, same behaviour as the syndicate panels.
  const Action = ({ label, onClick, k }: { label: string; onClick: () => void; k: string }) =>
    signer
      ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={onClick} disabled={busy === k}>{busy === k ? 'Signing…' : label}</button>
      : <button className={`${s.btn} ${s.btnPrimary}`} onClick={wax.connect} disabled={wax.connecting}>{wax.connecting ? 'Connecting…' : 'Connect WAX Wallet'}</button>

  const refundReady = res?.refundAt != null && res.refundAt <= Date.now()
  const refundTotal = (res?.refundCpu ?? 0) + (res?.refundNet ?? 0)

  return (
    <div>
      <PageHead title="Staking (WAX)" desc="A little WAX stays staked so your transactions are always covered — it's automatic and costs pennies. Optionally stake more to earn voting rewards." />

      {msg.err && <p className={s.err}>⚠ {msg.err}</p>}
      {msg.ok && <p className={s.ok}>{msg.ok}</p>}

      {/* Refund in progress */}
      {res && refundTotal > 0 && (
        <Card title="Unstaking in progress" tag={refundReady ? 'ready' : 'pending'}>
          <p className={s.empty} style={{ marginBottom: 10 }}>
            {fmtCoin(refundTotal, 'WAX')} is unstaking (CPU {fmt(res.refundCpu)} + NET {fmt(res.refundNet)}).{' '}
            {refundReady ? 'It is ready to return to your liquid balance.' : `Available ${res.refundAt ? new Date(res.refundAt).toLocaleString() : 'in ~72h'}.`}
          </p>
          {refundReady && <div className={s.stubActions}><Action label="Claim refund" onClick={() => run('refund', [{ account: 'eosio', name: 'refund', authorization: wax.auth(), data: { owner: signer } }], 'Refund claimed')} k="refund" /></div>}
        </Card>
      )}

      {/* Transaction fuel — the hero. Green when covered, drifts to red as used. */}
      <Card title="Transaction Fuel" tag="auto-covered">
        {!account ? <Empty text="Connect or load your account to see your transaction fuel." /> : !res ? <Empty text="Reading account…" /> : (
          <>
            <p className={s.empty} style={{ marginBottom: 16 }}>
              A little WAX stays staked so your transactions are always covered — you keep it, and it&apos;s only pennies. When the bar turns orange or red, tap <b>Top up</b>.
            </p>
            <Meter label="Transaction capacity (CPU)" used={res.cpuUsed} max={res.cpuMax} />
            <Meter label="Network (NET)" used={res.netUsed} max={res.netMax} />
            <div className={s.stubActions} style={{ marginTop: 14, alignItems: 'center', gap: 12 }}>
              {needTopUp
                ? <Action label={`Top up · ~${topUpWax.toFixed(0)} $WAX`} onClick={doTopUp} k="topup" />
                : signer
                  ? <>
                      <span className={s.ok} style={{ margin: 0 }}>✓ Topped up — you&apos;re covered</span>
                      <button className={s.btn} onClick={doAddMore} disabled={busy === 'topup'}>{busy === 'topup' ? 'Signing…' : 'Add more'}</button>
                    </>
                  : <span className={s.ok} style={{ margin: 0 }}>✓ Buffer is topped up</span>}
            </div>
          </>
        )}
      </Card>

      {/* Earn rewards — clearly optional. */}
      <Card title="Earn Rewards (optional)" tag="optional">
        <p className={s.empty} style={{ marginBottom: 10 }}>
          Want your staked $WAX to earn a little every day? Vote for one <b>proxy</b> (a curator who votes for guilds for you), then claim rewards whenever.{' '}
          {res?.hasVote ? `You currently vote for ${res.proxy ? res.proxy : `${res.producers.length} guilds`}.` : 'You are not voting yet.'}
        </p>
        <div className={s.formRow}><input className={s.input} placeholder="proxy account" value={proxy} onChange={e => setProxy(e.target.value)} /></div>
        <div className={s.stubActions} style={{ gap: 12 }}>
          <Action label="Vote for proxy" onClick={doVote} k="vote" />
          <Action label="Claim rewards" onClick={doClaim} k="claim" />
        </div>
        <p className={s.empty} style={{ marginTop: 10 }}>Voter rewards build up every 24 hours and stack until you claim.</p>
      </Card>

      {/* Advanced — the real numbers + manual controls, hidden by default. */}
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--aww-text-dim)', fontSize: 13, padding: '8px 2px', fontFamily: 'var(--aww-font-mono)', letterSpacing: '.04em' }}>
          Advanced — resource details &amp; manual staking
        </summary>
        <div style={{ marginTop: 10 }}>
          <Card title="Resource Details" tag="live read">
            {!res ? <Empty text="Load an account to see details." /> : (
              <Grid>
                <Stat label="Liquid WAX" value={fmtCoin(res.liquidWax, 'WAX')} sub={usd(res.liquidWax)} />
                <Stat label="CPU staked" value={fmtCoin(res.cpuStaked, 'WAX')} sub={usd(res.cpuStaked)} />
                <Stat label="NET staked" value={fmtCoin(res.netStaked, 'WAX')} sub={usd(res.netStaked)} />
                <Stat label="CPU used" value={`${pct(res.cpuUsed, res.cpuMax).toFixed(0)}%`} sub={`${(res.cpuUsed / 1000).toFixed(1)} / ${(res.cpuMax / 1000).toFixed(0)} ms`} />
                <Stat label="NET used" value={`${pct(res.netUsed, res.netMax).toFixed(0)}%`} sub={`${(res.netUsed / 1024).toFixed(1)} / ${(res.netMax / 1024).toFixed(0)} KB`} />
                <Stat label="RAM used" value={`${pct(res.ramUsed, res.ramQuota).toFixed(0)}%`} sub={`${(res.ramUsed / 1024).toFixed(0)} / ${(res.ramQuota / 1024).toFixed(0)} KB`} />
              </Grid>
            )}
          </Card>

          <Card title="Stake $WAX manually" tag="signs on-chain">
            <p className={s.empty} style={{ marginBottom: 10 }}>Stake extra $WAX to CPU (transactions) or NET (bandwidth). You keep ownership — unstake anytime, with a 72h wait.</p>
            <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="$WAX → CPU" value={stakeCpu} onChange={e => setStakeCpu(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="$WAX → NET" value={stakeNet} onChange={e => setStakeNet(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            <div className={s.stubActions}><Action label="Stake $WAX" onClick={doStake} k="stake" /></div>
          </Card>

          <Card title="Unstake $WAX" tag="signs on-chain">
            <p className={s.empty} style={{ marginBottom: 10 }}>Free up staked $WAX. It returns to your liquid balance 72 hours after you confirm.</p>
            <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="Unstake from CPU" value={unCpu} onChange={e => setUnCpu(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="Unstake from NET" value={unNet} onChange={e => setUnNet(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            <div className={s.stubActions}><Action label="Unstake $WAX" onClick={doUnstake} k="unstake" /></div>
          </Card>
        </div>
      </details>
    </div>
  )
}
