'use client'

import s from '../aw.module.css'
import { Card, Grid, Empty, PageHead } from '../ui/primitives'
import { planetColor } from '../lib/waxData'
import { PlanetVideo } from '../ui/PlanetVideo'
import AccountName from './AccountName'
import type { FeatureProps } from './ctx'

export default function Syndicates({ planets }: FeatureProps) {
  return (
    <>
      <PageHead title="Syndicates" desc="The six Planetary DAOs — custodians, candidates and treasuries, read live from dao.worlds." />
      <Card title="Planetary DAOs" tag="live read">
        {planets.length === 0 ? <Empty text="Loading planet DAOs…" /> : (
          <Grid>
            {planets.map(p => {
              const c = planetColor(p.planet)
              return (
                <div key={p.symbol} className={s.planet} style={{ borderLeftColor: c, position: 'relative', overflow: 'hidden', background: '#000' }}>
                  <PlanetVideo planet={p.planet} mode="tile" />
                  <div className={s.planetScrim} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div className={s.planetName} style={{ color: c }}>{p.planet}</div>
                    <div className={s.planetRow}>{p.custodians.length}/{p.numElected} custodians</div>
                    <div className={s.planetRow}>{p.candidates.length} candidates</div>
                    <div className={s.planetRow}>Top: {(() => { const t = p.candidates[0]?.name || p.custodians[0]?.name; return t ? <AccountName name={t} role="Top" /> : '—' })()}</div>
                    <div className={s.planetRow}>Proposal budget: {p.proposalBudget}</div>
                    <div className={s.planetRow}>Staking: {p.stakingEnabled ? '✓ open' : '✗ closed'}</div>
                  </div>
                </div>
              )
            })}
          </Grid>
        )}
      </Card>
    </>
  )
}
