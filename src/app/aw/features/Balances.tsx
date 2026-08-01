'use client'

import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { fmtCoin, planetColor } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const LABELS: Record<string, string> = { TLM: 'Trilium (TLM)', WAX: 'WAX' }

export default function Balances({ holdings }: FeatureProps) {
  const prices = usePrices()
  const usdSub = (symbol: string, amount: number) => {
    const v = usdFor(symbol, amount, prices)
    return v == null ? undefined : fmtUsd(v)
  }
  const base = holdings?.tokens.filter(t => !t.planet) ?? []
  const planet = holdings?.tokens.filter(t => t.planet) ?? []

  return (
    <>
      <PageHead title="Dashboard" desc="Your Trilium, WAX and planet-token balances, live from the WAX chain." />
      <Card title="Wallet" tag="live read">
        {!holdings ? <Empty text="Enter a WAX account above and hit Load to see balances." /> : (
          <Grid>
            {base.map(t => <Stat key={t.symbol} label={LABELS[t.symbol] || t.symbol} value={fmtCoin(t.amount, t.symbol)} sub={usdSub(t.symbol, t.amount)} />)}
            {base.length === 0 && <Empty text="No base tokens held." />}
          </Grid>
        )}
      </Card>
      <Card title="Planet Tokens" tag="live read">
        {!holdings ? <Empty text="Planet-token balances appear here once an account is loaded." /> : (
          planet.length === 0 ? <Empty text="No planet tokens held. Stake Trilium to a planet to receive them." /> : (
            <Grid>
              {planet.map(t => (
                <Stat key={t.symbol} label={`${t.planet} (${t.symbol})`} value={fmtCoin(t.amount, t.symbol)} sub={usdSub(t.symbol, t.amount)} color={planetColor(t.planet)} />
              ))}
            </Grid>
          )
        )}
      </Card>
    </>
  )
}
