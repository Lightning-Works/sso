'use client'

import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { planetColor } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFromAsset, fmtUsd } from '../lib/aw/prices'
import AccountName from './AccountName'
import type { FeatureProps } from './ctx'

/** Detail view for a single planetary Syndicate — real dao.worlds data. */
export default function PlanetDetail({ planets, planet }: FeatureProps & { planet: string }) {
  const p = planets.find(x => x.planet === planet)
  const c = planetColor(planet)
  const prices = usePrices()
  const power = (raw: string) => (Number(raw) / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const withUsd = (asset: string) => { const v = usdFromAsset(asset, prices); return v == null ? asset : `${asset} ${fmtUsd(v)}` }

  return (
    <>
      <PageHead title={planet} desc="Planetary Syndicate — council, candidates and treasury. Hover a name for their on-chain profile." />
      {!p ? <Card><Empty text="Loading planet data…" /></Card> : (
        <>
          <Card title="Overview" tag="live read">
            <div className={s.review}>
              <span>Custodians</span><b>{p.custodians.length}/{p.numElected}</b>
              <span>Candidates</span><b>{p.candidates.length}</b>
              <span>Proposal budget</span><b>{withUsd(p.proposalBudget)}</b>
              <span>Staking</span><b>{p.stakingEnabled ? 'Open' : 'Closed'}</b>
            </div>
          </Card>
          <Card title="Council (custodians)" tag="live read">
            {p.custodians.length === 0 ? <Empty text="No custodians." /> : (
              <div className={s.list}>
                {p.custodians.map((cu, i) => (
                  <div key={i} className={s.listRow}>
                    <span style={{ color: c }}>{i + 1}</span>
                    <b><AccountName name={cu.name} role={`Custodian #${i + 1}`} votePower={cu.totalVotePower} voters={cu.numVoters} pay={cu.requestedPay} /></b>
                    <span className={s.listMeta}>{power(cu.totalVotePower)} power · {cu.numVoters} voters</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Candidates" tag="live read">
            {p.candidates.length === 0 ? <Empty text="No active candidates." /> : (
              <div className={s.list}>
                {p.candidates.slice(0, 25).map((ca, i) => (
                  <div key={i} className={s.listRow}>
                    <span style={{ color: c }}>{i + 1}</span>
                    <b><AccountName name={ca.name} role="Candidate" votePower={ca.totalVotePower} voters={ca.numVoters} pay={ca.requestedPay} /></b>
                    <span className={s.listMeta}>{power(ca.totalVotePower)} power · pay {ca.requestedPay}</span>
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
