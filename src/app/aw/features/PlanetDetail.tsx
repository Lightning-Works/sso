'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty } from '../ui/primitives'
import { PlanetVideo } from '../ui/PlanetVideo'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, usdFromAsset, fmtUsd } from '../lib/aw/prices'
import { fmt } from '../lib/waxData'
import { fetchPlanetHoldings, type PlanetHoldings } from '../lib/aw/planetHoldings'
import { useWax } from '../lib/aw/useWax'
import AccountName from './AccountName'
import type { FeatureProps } from './ctx'

export default function PlanetDetail({ planets, planet, account }: FeatureProps & { planet: string }) {
  const p = planets.find(x => x.planet === planet)
  const scope = planet.toLowerCase()
  const symbol = p?.symbol || ''
  const maxVotes = p?.maxVotes || 2

  const prices = usePrices()
  const wax = useWax()
  const [hold, setHold] = useState<PlanetHoldings | null>(null)
  const [amount, setAmount] = useState('')
  const [votes, setVotes] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})
  const [busy, setBusy] = useState('')

  const loadHoldings = () => { if (account && symbol) fetchPlanetHoldings(account, symbol, scope).then(setHold).catch(() => {}) }
  useEffect(() => { setHold(null); loadHoldings() }, [account, symbol, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const usd = (amt: number, sym: string) => { const v = usdFor(sym, amt, prices); return v == null ? '' : ' ' + fmtUsd(v) }
  const withUsd = (asset: string) => { const v = usdFromAsset(asset, prices); return v == null ? asset : `${asset} ${fmtUsd(v)}` }
  const power = (raw: string) => (Number(raw) / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const supply = p ? Number((p.totalSupply || '0').split(' ')[0]).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '…'
  const cycle = p ? (p.periodLength >= 86400 ? `${Math.round(p.periodLength / 86400)} days` : `${Math.round(p.periodLength / 3600)} hrs`) : '…'

  async function doStake() {
    setMsg({})
    const amt = parseFloat(amount)
    if (!wax.signer) { setMsg({ err: 'Connect your WAX wallet first' }); return }
    if (!amt || amt <= 0) { setMsg({ err: 'Enter an amount greater than 0' }); return }
    setBusy('stake')
    try {
      const r = await wax.submit([{ account: 'token.worlds', name: 'stake', authorization: wax.auth(), data: { account: wax.signer, quantity: `${amt.toFixed(4)} ${symbol}` } }])
      setMsg({ ok: `Staked — tx ${r.transaction_id?.slice(0, 10) ?? 'sent'}…` }); setAmount(''); loadHoldings()
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : 'stake failed' }) }
    finally { setBusy('') }
  }

  async function doVote() {
    setMsg({})
    if (!wax.signer) { setMsg({ err: 'Connect your WAX wallet first' }); return }
    if (votes.length === 0) { setMsg({ err: 'Select at least one candidate' }); return }
    setBusy('vote')
    try {
      const r = await wax.submit([{ account: 'dao.worlds', name: 'votecust', authorization: wax.auth(), data: { voter: wax.signer, newvotes: votes, dac_id: scope } }])
      setMsg({ ok: `Votes cast — tx ${r.transaction_id?.slice(0, 10) ?? 'sent'}…` })
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : 'vote failed' }) }
    finally { setBusy('') }
  }

  const toggleVote = (name: string) =>
    setVotes(v => v.includes(name) ? v.filter(x => x !== name) : v.length < maxVotes ? [...v, name] : v)

  const ConnectOrAction = ({ label, onClick, busyKey }: { label: string; onClick: () => void; busyKey: string }) =>
    wax.signer
      ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={onClick} disabled={busy === busyKey}>{busy === busyKey ? 'Signing…' : label}</button>
      : <button className={`${s.btn} ${s.btnPrimary}`} onClick={wax.connect} disabled={wax.connecting}>{wax.connecting ? 'Connecting…' : 'Connect WAX Wallet'}</button>

  return (
    <>
      {/* Header: info (2/3) left, spinning planet (1/3) right */}
      <div className={s.synHeader}>
        <div className={s.synHeaderInfo}>
          <h1 className={s.synHeaderTitle}>{planet} <span style={{ color: 'var(--aww-text-muted)', fontWeight: 600, fontSize: '0.6em' }}>${symbol}</span></h1>
          <div className={s.review}>
            <span>Total {symbol} supply</span><b>{supply}</b>
            <span>Your {symbol} (liquid)</span><b>{account ? (hold ? fmt(hold.liquid) + usd(hold.liquid, symbol) : '…') : '—'}</b>
            <span>Your {symbol} staked</span><b>{account ? (hold ? fmt(hold.staked) + usd(hold.staked, symbol) : '…') : '—'}</b>
            <span>Custodians</span><b>{p ? `${p.custodians.length}/${p.numElected}` : '…'}</b>
            <span>Election cycle</span><b>{cycle}</b>
            <span>Proposal budget</span><b>{p ? withUsd(p.proposalBudget) : '…'}</b>
            <span>Staking</span><b>{p ? (p.stakingEnabled ? 'Open' : 'Closed') : '…'}</b>
          </div>
        </div>
        <div className={s.synHeaderPlanet}><PlanetVideo planet={planet} mode="header" /></div>
      </div>

      {msg.err && <p className={s.err}>⚠ {msg.err}</p>}
      {msg.ok && <p className={s.ok}>✓ {msg.ok}</p>}

      {/* Stake */}
      <Card title={`Stake to ${planet}`} tag="signs on-chain">
        <p className={s.empty} style={{ marginBottom: 10 }}>Stake {symbol} for voting power and higher daily rewards. Trilium converts 1:1 to {symbol}.</p>
        <div className={s.formRow}>
          <label className={s.fieldLabel}>Amount ({symbol})</label>
          <input className={s.input} inputMode="decimal" placeholder={`0.0000 ${symbol}`} value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        <div className={s.stubActions}><ConnectOrAction label={`Stake ${symbol}`} onClick={doStake} busyKey="stake" /></div>
      </Card>

      {/* Vote */}
      {p && (
        <Card title={`Vote — up to ${maxVotes} custodians`} tag="signs on-chain">
          {p.candidates.length === 0 ? <Empty text="No active candidates." /> : (
            <>
              <div className={s.list}>
                {p.candidates.slice(0, 30).map((ca, i) => (
                  <label key={i} className={s.voteRow}>
                    <input type="checkbox" checked={votes.includes(ca.name)} onChange={() => toggleVote(ca.name)} />
                    <b><AccountName name={ca.name} role="Candidate" votePower={ca.totalVotePower} voters={ca.numVoters} pay={ca.requestedPay} /></b>
                    <span className={s.listMeta}>{power(ca.totalVotePower)} power</span>
                  </label>
                ))}
              </div>
              <div className={s.stubActions} style={{ marginTop: 12 }}>
                <ConnectOrAction label={`Cast ${votes.length} vote${votes.length !== 1 ? 's' : ''}`} onClick={doVote} busyKey="vote" />
              </div>
            </>
          )}
        </Card>
      )}

      {/* Council */}
      {p && (
        <Card title="Council (custodians)" tag="live read">
          {p.custodians.length === 0 ? <Empty text="No custodians." /> : (
            <div className={s.list}>
              {p.custodians.map((cu, i) => (
                <div key={i} className={s.listRow}>
                  <span>{i + 1}</span>
                  <b><AccountName name={cu.name} role={`Custodian #${i + 1}`} votePower={cu.totalVotePower} voters={cu.numVoters} pay={cu.requestedPay} /></b>
                  <span className={s.listMeta}>{power(cu.totalVotePower)} power · {cu.numVoters} voters</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  )
}
