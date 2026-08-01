'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchListings, type Listing } from '../lib/aw/market'

const price = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })

export default function Market({ schema, label }: { schema?: string; label?: string }) {
  const [rows, setRows] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    fetchListings({ schema, limit: 40 })
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false))
  }, [schema])

  const floor = rows[0]?.price

  return (
    <>
      <PageHead title={`Marketplace${label ? ` · ${label}` : ''}`} desc="Live on-chain listings from AtomicMarket — the same listings as AtomicHub, right in your wallet." />
      <Card title="Cheapest listings" tag="live · AtomicMarket">
        {loading ? <Empty text="Loading live listings…" />
          : error ? <p className={s.err}>⚠ {error}</p>
          : rows.length === 0 ? <Empty text="No active listings." />
          : (
            <>
              {floor !== undefined && <div className={s.msg}>Floor price: {price(floor)} $WAX</div>}
              <div className={s.list}>
                {rows.map(r => (
                  <div key={r.saleId} className={s.listRow}>
                    <b>{r.name}</b>
                    <span className={s.listMeta}>{price(r.price)} $WAX · {r.schema.replace('.worlds', '')} · {r.seller}</span>
                    <button className={`${s.btn} ${s.btnGhost}`} disabled title="Buy on-chain via atomicmarket::purchasesale — Phase 2">Buy</button>
                  </div>
                ))}
              </div>
              <p className={s.empty} style={{ marginTop: 10 }}>
                Buy / list / cancel run natively on-chain (atomicmarket::purchasesale / announcesale / cancelsale) once signing is wired — no separate marketplace needed.
              </p>
            </>
          )}
      </Card>
    </>
  )
}
