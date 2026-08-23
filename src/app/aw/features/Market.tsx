'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchListings, type Listing } from '../lib/aw/market'

const price = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })

/** Read ?template=<id> from the current URL (set by the Shine "Buy more" link). */
function templateFromUrl(): number | null {
  try { const v = new URLSearchParams(window.location.search).get('template'); return v ? Number(v) || null : null } catch { return null }
}

export default function Market({ schema, label }: { schema?: string; label?: string }) {
  const [rows, setRows] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templateId, setTemplateId] = useState<number | null>(null)

  // Pick up the ?template filter on mount and on back/forward navigation.
  useEffect(() => {
    setTemplateId(templateFromUrl())
    const onPop = () => setTemplateId(templateFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    setLoading(true); setError('')
    fetchListings({ schema, limit: 40, templateId: templateId || undefined })
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false))
  }, [schema, templateId])

  const floor = rows[0]?.price
  const filteredName = templateId ? rows[0]?.name : null

  const clearFilter = () => {
    setTemplateId(null)
    try { window.history.replaceState(null, '', '/aw/market/tools') } catch { /* ignore */ }
  }

  return (
    <>
      <PageHead title={`Marketplace${label ? ` · ${label}` : ''}`} desc="Live on-chain listings from AtomicMarket — the same listings as AtomicHub, right in your wallet." />
      <Card title={templateId ? `Cheapest: ${filteredName || 'selected tool'}` : 'Cheapest listings'} tag="live · AtomicMarket">
        {templateId && (
          <div className={s.msg} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Showing only the tool you need for forging, cheapest first.</span>
            <button className={`${s.btn} ${s.btnGhost}`} onClick={clearFilter}>Show all tools</button>
          </div>
        )}
        {loading ? <Empty text="Loading live listings…" />
          : error ? <p className={s.err}>⚠ {error}</p>
          : rows.length === 0 ? <Empty text={templateId ? 'No active listings for this tool right now.' : 'No active listings.'} />
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
