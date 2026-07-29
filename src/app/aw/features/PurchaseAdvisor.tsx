'use client'

import { useEffect, useMemo, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchTools, bestForTlm, type Tool } from '../lib/aw/tools'
import { fetchToolOffers, type ToolOffer } from '../lib/aw/market'
import { fetchUsdPrices, type UsdPrices } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const ratio = (luck: number, delay: number) => (delay > 0 ? luck / delay : 0)

type Rec = { offer: ToolOffer; improvePct: number; deltaTlmDay: number; priceUsd: number; paybackDays: number }

export default function PurchaseAdvisor({ account }: FeatureProps) {
  const [tools, setTools] = useState<Tool[]>([])
  const [offers, setOffers] = useState<ToolOffer[]>([])
  const [prices, setPrices] = useState<UsdPrices | null>(null)
  const [tlmPerDay, setTlmPerDay] = useState('300')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!account) { setTools([]); setOffers([]); return }
    setLoading(true); setError('')
    Promise.all([
      fetchTools(account),
      fetchToolOffers(100),
      fetchUsdPrices().catch(() => null),
    ]).then(([t, o, p]) => { setTools(t); setOffers(o); setPrices(p) })
      .catch(e => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false))
  }, [account])

  const base = useMemo(() => bestForTlm(tools), [tools])
  const baseRatio = ratio(base.luck, base.delay)
  const current = Number(tlmPerDay) || 0

  const recs = useMemo<Rec[]>(() => {
    if (offers.length === 0) return []
    return offers.map(o => {
      const cand = bestForTlm([...tools, o])
      const candRatio = ratio(cand.luck, cand.delay)
      const improvePct = baseRatio > 0 ? (candRatio - baseRatio) / baseRatio : (candRatio > 0 ? 1 : 0)
      const newTlmDay = baseRatio > 0 ? current * (candRatio / baseRatio) : current
      const deltaTlmDay = newTlmDay - current
      const priceUsd = prices ? o.price * prices.wax : 0
      const deltaUsdDay = prices ? deltaTlmDay * prices.tlm : 0
      const paybackDays = deltaUsdDay > 0 ? priceUsd / deltaUsdDay : Infinity
      return { offer: o, improvePct, deltaTlmDay, priceUsd, paybackDays }
    })
      .filter(r => r.improvePct > 0.005)
      .sort((a, b) => prices ? a.paybackDays - b.paybackDays : b.improvePct - a.improvePct)
      .slice(0, 8)
  }, [offers, tools, baseRatio, current, prices])

  return (
    <>
      <PageHead title="Upgrade Advisor" desc="Which tool to buy to earn more Trilium — with price, expected gain, and payback." />

      <Card title="Your current mining rate" tag="set this">
        <div className={s.formRow}>
          <label className={s.fieldLabel}>Your current earnings (TLM / day) — set your real number for accurate payback</label>
          <input className={s.input} inputMode="decimal" value={tlmPerDay} onChange={e => setTlmPerDay(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        <p className={s.empty}>
          We anchor the estimates to your own rate. Gains scale your loadout's <b>luck ÷ delay</b> score; payback uses live WAX + TLM prices{prices ? '' : ' (unavailable right now — showing % gain only)'}.
        </p>
      </Card>

      {!account ? <Card><Empty text="Load or connect a WAX account to get purchase recommendations." /></Card>
        : loading ? <Card><Empty text="Reading your tools + live market prices…" /></Card>
        : error ? <Card><p className={s.err}>⚠ {error}</p></Card>
        : recs.length === 0 ? <Card><Empty text="No buyable tool would improve your current loadout right now." /></Card>
        : (
          <Card title="Recommended purchases" tag="live · market + your tools">
            <div className={s.list}>
              {recs.map((r, i) => (
                <div key={r.offer.saleId || i} className={s.recRow}>
                  <div className={s.recMain}>
                    <b>{r.offer.name}{r.offer.shine ? ` · ${r.offer.shine}` : ''}</b>
                    <span className={s.recSub}>{r.offer.rarity} · delay {r.offer.delay}s · luck {r.offer.luck}</span>
                  </div>
                  <div className={s.recStats}>
                    <span className={s.recPrice}>{r.offer.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} WAX{prices ? ` · $${r.priceUsd.toFixed(2)}` : ''}</span>
                    <span className={s.recGain}>+{(r.improvePct * 100).toFixed(0)}% · +{r.deltaTlmDay.toFixed(1)} TLM/day</span>
                    <span className={s.recPay}>{prices && isFinite(r.paybackDays) ? `pays for itself in ~${Math.ceil(r.paybackDays)} days` : 'payback n/a'}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className={s.empty} style={{ marginTop: 12 }}>
              Estimates, not guarantees — the exact TLM payout constant lives in the contract code, so treat these as “which buy is the best value,” anchored to your own daily rate.
            </p>
          </Card>
        )}
    </>
  )
}
