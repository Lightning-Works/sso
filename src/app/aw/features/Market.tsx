'use client'

import { useEffect, useMemo, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { ShineBadge } from '@/components/ShineBadge'
import { fetchListings, type Listing } from '../lib/aw/market'
import { buildBuyActions } from '../lib/aw/buyTool'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import type { NftItem } from '@/components/NftGrid'

const price = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })

type BuyState = { saleId: string; stage: 'confirm' | 'working' | 'done' | 'err'; msg?: string }

/** Read ?template=<id> from the current URL (set by the Shine "Buy More Here" link). */
function templateFromUrl(): number | null {
  try { const v = new URLSearchParams(window.location.search).get('template'); return v ? Number(v) || null : null } catch { return null }
}

export default function Market({ schema, label }: { schema?: string; label?: string }) {
  const [rows, setRows] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [buy, setBuy] = useState<BuyState | null>(null)
  const { fetchThumbs, applyThumbs } = useThumbnails()

  // Route art through the SSO thumbnail proxy (cached same-origin webp) instead
  // of the flaky public IPFS gateways — the raw gateways frequently 503.
  const thumbItems = useMemo<NftItem[]>(() => {
    const seen = new Set<number>()
    const out: NftItem[] = []
    for (const r of rows) {
      if (!r.templateId || seen.has(r.templateId) || !r.imageUrl) continue
      seen.add(r.templateId)
      out.push({ id: String(r.templateId), name: r.name, imageUrl: r.imageUrl, chain: 'WAX', collection: 'Alien Worlds' })
    }
    return out
  }, [rows])
  useEffect(() => { if (thumbItems.length) fetchThumbs(thumbItems, 'aww-market') }, [thumbItems, fetchThumbs])
  const imgByTid = useMemo(() => {
    const map: Record<number, string | null> = {}
    for (const it of applyThumbs(thumbItems)) map[Number(it.id)] = it.thumbUrl || it.imageUrl
    return map
  }, [thumbItems, applyThumbs])

  // Click once to arm ("Confirm • N $WAX"), click again to sign the on-chain
  // purchase (deposit WAX + atomicmarket::purchasesale) via the wallet popup.
  const onBuy = async (r: Listing) => {
    const armed = buy?.saleId === r.saleId && buy.stage === 'confirm'
    if (!armed) { setBuy({ saleId: r.saleId, stage: 'confirm' }); return }
    setBuy({ saleId: r.saleId, stage: 'working' })
    try {
      if (!currentAccount()) await connectWax()      // keep inside the click gesture
      const acct = currentAccount()
      if (!acct) throw new Error('Connect your WAX wallet to buy')
      await transact(buildBuyActions(acct, r.saleId, r.price))
      setBuy({ saleId: r.saleId, stage: 'done' })
      setTimeout(() => { setRows(prev => prev.filter(x => x.saleId !== r.saleId)); setBuy(null) }, 1600)
    } catch (e) {
      setBuy({ saleId: r.saleId, stage: 'err', msg: e instanceof Error ? e.message : 'Buy failed' })
    }
  }

  // The ?template deep-link (from Shine's "Buy More Here") only applies to the
  // Tools view. Re-read it whenever the sub-view (schema) changes or on back/
  // forward, so switching to Land/Weapons/All clears the tool filter.
  useEffect(() => {
    const read = () => setTemplateId(schema === 'tool.worlds' ? templateFromUrl() : null)
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [schema])

  useEffect(() => {
    setLoading(true); setError('')
    fetchListings({ schema, limit: 48, templateId: templateId || undefined })
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
      <PageHead title={`Marketplace${label ? ` · ${label}` : ''}`} />
      <Card title={templateId ? `Cheapest: ${filteredName || 'selected item'}` : 'Cheapest listings'}>
        {templateId && (
          <div className={s.msg} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Showing only the tool you need for forging, cheapest first.</span>
            <button className={`${s.btn} ${s.btnGhost}`} onClick={clearFilter}>Show all tools</button>
          </div>
        )}
        {floor !== undefined && !loading && !error && <div className={s.msg}>Floor price: {price(floor)} $WAX</div>}

        {loading ? <Empty text="Loading live listings…" />
          : error ? <p className={s.err}>⚠ {error}</p>
          : rows.length === 0 ? <Empty text={templateId ? 'No active listings for this tool right now.' : 'No active listings.'} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {rows.map(r => (
                <div key={r.saleId} style={{
                  background: 'var(--nft-card-bg, #1a1a1c)', borderRadius: 10, overflow: 'hidden',
                  border: '1px solid color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', display: 'flex', flexDirection: 'column',
                }}>
                  <NftThumb src={imgByTid[r.templateId] ?? r.imageUrl} alt={r.name} radius={0} />
                  <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--aww-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 55%, #fff)' }}>{price(r.price)} $WAX</span>
                      <ShineBadge shine={r.shine} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--aww-text-muted, #9aa)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.schema.replace('.worlds', '')} · {r.seller}</div>
                    {(() => {
                      const b = buy?.saleId === r.saleId ? buy : null
                      const label = b?.stage === 'working' ? 'Buying…'
                        : b?.stage === 'done' ? 'Bought ✓'
                        : b?.stage === 'confirm' ? `Confirm • ${price(r.price)} $WAX`
                        : 'Buy'
                      return (
                        <>
                          <button
                            className={`${s.btn} ${b?.stage === 'confirm' ? s.btnPrimary : s.btnGhost}`}
                            style={{ marginTop: 2 }}
                            disabled={b?.stage === 'working' || b?.stage === 'done'}
                            onClick={() => onBuy(r)}
                          >
                            {label}
                          </button>
                          {b?.stage === 'err' && <div style={{ fontSize: 10, color: '#ff6b6b', marginTop: 4, lineHeight: 1.3 }}>{b.msg}</div>}
                        </>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
    </>
  )
}
