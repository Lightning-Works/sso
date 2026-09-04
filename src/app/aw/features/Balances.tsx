'use client'

import s from '../aw.module.css'
import { Card, Stat, Empty, PageHead } from '../ui/primitives'
import { fmtCoin, planetColor } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const LABELS: Record<string, string> = { TLM: 'Trilium (TLM)', WAX: 'WAX' }
const COIN_ICON: Record<string, string> = {
  WAX: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/wax/large.png',
  TLM: '/aww/trilium.webp',
}

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
          <div className={s.coinGrid}>
            {base.map(t => {
              const usd = usdSub(t.symbol, t.amount)
              return (
                <div key={t.symbol} className={`${s.stat} ${s.coinCard}`}>
                  {COIN_ICON[t.symbol] && <img className={s.coinIcon} src={COIN_ICON[t.symbol]} alt={t.symbol} />}
                  <div className={s.coinText}>
                    <div className={s.statVal} title={fmtCoin(t.amount, t.symbol)}>{fmtCoin(t.amount, t.symbol)}</div>
                    {usd && <div className={s.statUsd}>{usd}</div>}
                    <div className={s.statLabel}>{LABELS[t.symbol] || t.symbol}</div>
                  </div>
                </div>
              )
            })}
            {base.length === 0 && <Empty text="No base tokens held." />}
          </div>
        )}
      </Card>
      <Card title="Planet Tokens" tag="live read">
        {!holdings ? <Empty text="Planet-token balances appear here once an account is loaded." /> : (
          planet.length === 0 ? <Empty text="No planet tokens held. Stake Trilium to a planet to receive them." /> : (
            <div className={s.triGrid}>
              {planet.map(t => (
                <Stat key={t.symbol} label={`${t.planet} (${t.symbol})`} value={fmtCoin(t.amount, t.symbol)} sub={usdSub(t.symbol, t.amount)} color={planetColor(t.planet)} />
              ))}
            </div>
          )
        )}
      </Card>
    </>
  )
}
