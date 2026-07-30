'use client'

import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { PlanetVideo } from '../ui/PlanetVideo'
import type { FeatureProps } from './ctx'

export default function Syndicates({ planets, navigate }: FeatureProps) {
  return (
    <>
      <PageHead title="Syndicates" desc="The six Planetary DAOs. Click a planet to open its syndicate — holdings, staking and voting." />
      <Card title="Planets" tag="live read">
        {planets.length === 0 ? <Empty text="Loading planet DAOs…" /> : (
          <div className={s.synGrid}>
            {planets.map(p => (
              <button key={p.symbol} className={s.synCard} onClick={() => navigate(`syn.${p.symbol}`)}>
                <div className={s.synVideo}><PlanetVideo planet={p.planet} mode="banner" /></div>
                <div className={s.synBody}>
                  <div className={s.synName}>{p.planet} <span className={s.synSym}>${p.symbol}</span></div>
                  <div className={s.synMeta}>{p.custodians.length}/{p.numElected} custodians · {p.candidates.length} candidates</div>
                  <div className={s.synMeta}>Staking {p.stakingEnabled ? 'open' : 'closed'}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
