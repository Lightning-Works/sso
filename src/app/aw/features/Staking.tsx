'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { fmt } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import { useWax } from '../lib/aw/useWax'
import { fetchWaxResources, waxAsset, type WaxResources } from '../lib/aw/waxAccount'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

// A well-known WAX staking-reward proxy, pre-filled so a user can start
// earning rewards in one click. They can replace it with any proxy they trust.
const DEFAULT_PROXY = 'proxy4nation'

const pct = (used: number, max: number) => (max > 0 ? Math.min(100, (used / max) * 100) : 0)

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
      <PageHead title="Staking (WAX)" desc="Stake WAX for CPU & NET resources, vote for a proxy to earn daily rewards, and claim them. Unstaking takes 72 hours." />

      {msg.err && <p className={s.err}>⚠ {msg.err}</p>}
      {msg.ok && <p className={s.ok}>{msg.ok}</p>}

      {/* Resource overview */}
      <Card title="Your Resources" tag="live read">
        {!account ? <Empty text="Load a WAX account above to see your staked resources." /> : !res ? <Empty text="Reading account…" /> : (
          <Grid>
            <Stat label="Liquid WAX" value={fmt(res.liquidWax)} sub={usd(res.liquidWax)} />
            <Stat label="CPU staked" value={`${fmt(res.cpuStaked)} WAX`} sub={usd(res.cpuStaked)} />
            <Stat label="NET staked" value={`${fmt(res.netStaked)} WAX`} sub={usd(res.netStaked)} />
            <Stat label="CPU used" value={`${pct(res.cpuUsed, res.cpuMax).toFixed(0)}%`} sub={`${(res.cpuUsed / 1000).toFixed(1)} / ${(res.cpuMax / 1000).toFixed(0)} ms`} />
            <Stat label="NET used" value={`${pct(res.netUsed, res.netMax).toFixed(0)}%`} sub={`${(res.netUsed / 1024).toFixed(1)} / ${(res.netMax / 1024).toFixed(0)} KB`} />
            <Stat label="RAM used" value={`${pct(res.ramUsed, res.ramQuota).toFixed(0)}%`} sub={`${(res.ramUsed / 1024).toFixed(0)} / ${(res.ramQuota / 1024).toFixed(0)} KB`} />
          </Grid>
        )}
      </Card>

      {/* Refund in progress */}
      {res && refundTotal > 0 && (
        <Card title="Unstaking in progress" tag={refundReady ? 'ready' : 'pending'}>
          <p className={s.empty} style={{ marginBottom: 10 }}>
            {fmt(refundTotal)} WAX is unstaking (CPU {fmt(res.refundCpu)} + NET {fmt(res.refundNet)}).{' '}
            {refundReady ? 'It is ready to return to your liquid balance.' : `Available ${res.refundAt ? new Date(res.refundAt).toLocaleString() : 'in ~72h'}.`}
          </p>
          {refundReady && <div className={s.stubActions}><Action label="Claim refund" onClick={() => run('refund', [{ account: 'eosio', name: 'refund', authorization: wax.auth(), data: { owner: signer } }], 'Refund claimed')} k="refund" /></div>}
        </Card>
      )}

      {/* Stake */}
      <Card title="Stake WAX" tag="signs on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>Lock WAX to get CPU (for transactions) and NET (bandwidth). You keep ownership — unstake anytime, with a 72h wait. CPU is the one you&apos;ll usually need; 50–100 WAX is plenty for normal use.</p>
        <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="WAX → CPU" value={stakeCpu} onChange={e => setStakeCpu(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="WAX → NET" value={stakeNet} onChange={e => setStakeNet(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        <div className={s.stubActions}><Action label="Stake WAX" onClick={doStake} k="stake" /></div>
      </Card>

      {/* Unstake */}
      <Card title="Unstake WAX" tag="signs on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>Free up staked WAX. It returns to your liquid balance 72 hours after you confirm.</p>
        <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="Unstake from CPU" value={unCpu} onChange={e => setUnCpu(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        <div className={s.formRow}><input className={s.input} inputMode="decimal" placeholder="Unstake from NET" value={unNet} onChange={e => setUnNet(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        <div className={s.stubActions}><Action label="Unstake WAX" onClick={doUnstake} k="unstake" /></div>
      </Card>

      {/* Vote for rewards */}
      <Card title="Vote for Rewards" tag="signs on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>
          Staked WAX only earns rewards once you vote. The easy path is voting for one <b>proxy</b> (a curator who votes for guilds on your behalf).{' '}
          {res?.hasVote ? `You currently vote for ${res.proxy ? res.proxy : `${res.producers.length} guilds`}.` : 'You are not voting yet.'}
        </p>
        <div className={s.formRow}><input className={s.input} placeholder="proxy account" value={proxy} onChange={e => setProxy(e.target.value)} /></div>
        <div className={s.stubActions}><Action label="Vote for proxy" onClick={doVote} k="vote" /></div>
      </Card>

      {/* Claim */}
      <Card title="Claim Staking Rewards" tag="signs on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>Voter rewards build up every 24 hours and stack until you claim. Claim as often as you like.</p>
        <div className={s.stubActions}><Action label="Claim rewards" onClick={doClaim} k="claim" /></div>
      </Card>
    </div>
  )
}
