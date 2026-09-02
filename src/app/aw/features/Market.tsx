'use client'

/**
 * Marketplace — template-first ("stacked"): one card per design showing its art,
 * how many are listed, and the floor price; clicking drills into that design's
 * individual listings (paginated) where you can Buy. Images are keyed by template
 * so we never re-download the same art across thousands of identical mints.
 * A ?template deep-link (from Shine's "Buy More Here") opens a design directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { ShineBadge } from '@/components/ShineBadge'
import { fetchTemplateStacks, fetchListings, type TemplateStack, type Listing } from '../lib/aw/market'
import { buildBuyActions } from '../lib/aw/buyTool'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { usePrices } from '../lib/aw/usePrices'
import type { NftItem } from '@/components/NftGrid'

const PRIMARY = 'var(--aww-primary, #b06cff)'
const MUTED = 'var(--aww-text-muted, #9aa)'
const PAGE = 24
const price = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })

type BuyState = { saleId: string; stage: 'confirm' | 'working' | 'done' | 'err'; msg?: string }
const templateFromUrl = (): number | null => { try { const v = new URLSearchParams(window.location.search).get('template'); return v ? Number(v) || null : null } catch { return null } }

export default function Market({ schema, label }: { schema?: string; label?: string }) {
  const [drill, setDrill] = useState<number | null>(null)
  const prices = usePrices()
  const usd = (wax: number) => (prices?.wax ? wax * prices.wax : null)
  const usdText = (wax: number) => { const v = usd(wax); return v == null ? '' : (v >= 0.01 ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toFixed(4)}`) }

  // A ?template deep-link opens that design directly; also react to back/forward.
  useEffect(() => {
    const read = () => setDrill(templateFromUrl())
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [schema])

  const openDrill = (tid: number) => { setDrill(tid); try { window.history.replaceState(null, '', `${basePath(schema)}?template=${tid}`) } catch { /* ignore */ } }
  const backToStacks = () => { setDrill(null); try { window.history.replaceState(null, '', basePath(schema)) } catch { /* ignore */ } }

  return (
    <>
      <PageHead title={`Marketplace${label ? ` · ${label}` : ''}`} />
      {drill
        ? <DrillView templateId={drill} onBack={backToStacks} usdText={usdText} />
        : <StackView schema={schema} onOpen={openDrill} usdText={usdText} />}
    </>
  )
}

function basePath(schema?: string): string {
  return schema === 'tool.worlds' ? '/aw/market/tools'
    : schema === 'land.worlds' ? '/aw/market/land'
    : schema === 'arms.worlds' ? '/aw/market/weapons'
    : '/aw/market'
}

// ─────────────────────────── Stacked view ───────────────────────────
function StackView({ schema, onOpen, usdText }: { schema?: string; onOpen: (t: number) => void; usdText: (n: number) => string }) {
  const [page, setPage] = useState(1)
  const [stacks, setStacks] = useState<TemplateStack[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { fetchThumbs, applyThumbs, thumbsLoading } = useThumbnails()

  useEffect(() => { setPage(1) }, [schema])
  useEffect(() => {
    setLoading(true); setError('')
    fetchTemplateStacks({ schema, page, limit: PAGE })
      .then(setStacks).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
  }, [schema, page])

  const items = useMemo<NftItem[]>(() => (stacks || []).map(t => ({ id: String(t.templateId), name: t.name, imageUrl: t.img, chain: 'WAX', collection: 'Alien Worlds' })), [stacks])
  useEffect(() => { if (items.length) fetchThumbs(items, 'aww-market') }, [items, fetchThumbs])
  const imgByTid = useMemo(() => { const m: Record<number, string | null> = {}; for (const it of applyThumbs(items)) m[Number(it.id)] = it.thumbUrl || null; return m }, [items, applyThumbs])

  return (
    <Card title="Browse by design — floor price & how many listed" tag="live · AtomicMarket">
      {loading && !stacks ? <Empty text="Loading the marketplace…" />
        : error ? <p className={s.err}>⚠ {error}</p>
        : !stacks || stacks.length === 0 ? <Empty text="No active listings." />
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {stacks.map(t => (
                <button key={t.templateId} onClick={() => onOpen(t.templateId)}
                  style={{ textAlign: 'left', padding: 0, background: 'var(--nft-card-bg, #1a1a1c)', borderRadius: 10, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                  <NftThumb src={imgByTid[t.templateId] ?? null} loading={!imgByTid[t.templateId] && thumbsLoading} alt={t.name} radius={0} />
                  <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--aww-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: MUTED }}>{t.count.toLocaleString()} listed</span>
                      {t.shine && <ShineBadge shine={t.shine} style={{ fontSize: 9 }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 55%, #fff)' }}>from {price(t.floor)} $WAX</div>
                      {usdText(t.floor) && <div style={{ fontSize: 10, color: '#7fc8ff' }}>{usdText(t.floor)}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <Pager page={page} setPage={setPage} hasNext={stacks.length === PAGE} loading={loading} />
          </>
        )}
    </Card>
  )
}

// ─────────────────────────── Drill-down ───────────────────────────
function DrillView({ templateId, onBack, usdText }: { templateId: number; onBack: () => void; usdText: (n: number) => string }) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Listing[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buy, setBuy] = useState<BuyState | null>(null)

  useEffect(() => { setPage(1) }, [templateId])
  useEffect(() => {
    setLoading(true); setError('')
    fetchListings({ templateId, page, limit: 20 })
      .then(setRows).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
  }, [templateId, page])

  const onBuy = useCallback(async (r: Listing) => {
    const armed = buy?.saleId === r.saleId && buy.stage === 'confirm'
    if (!armed) { setBuy({ saleId: r.saleId, stage: 'confirm' }); return }
    setBuy({ saleId: r.saleId, stage: 'working' })
    try {
      if (!currentAccount()) await connectWax()
      const acct = currentAccount(); if (!acct) throw new Error('Connect your WAX wallet to buy')
      await transact(buildBuyActions(acct, r.saleId, r.price))
      setBuy({ saleId: r.saleId, stage: 'done' })
      setTimeout(() => { setRows(prev => (prev || []).filter(x => x.saleId !== r.saleId)); setBuy(null) }, 1600)
    } catch (e) { setBuy({ saleId: r.saleId, stage: 'err', msg: e instanceof Error ? e.message : 'Buy failed' }) }
  }, [buy])

  const name = rows?.[0]?.name || `Template ${templateId}`
  const img = rows?.[0]?.imageUrl

  return (
    <Card tag="live · AtomicMarket">
      <button onClick={onBack} className={`${s.btn} ${s.btnGhost}`} style={{ marginBottom: 12 }}>← All designs</button>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ width: 72, flexShrink: 0 }}><NftThumb src={img} loading={loading} alt={name} radius={8} /></div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--aww-text)' }}>{name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>Individual listings, cheapest first</div>
        </div>
      </div>

      {loading && !rows ? <Empty text="Loading listings…" />
        : error ? <p className={s.err}>⚠ {error}</p>
        : !rows || rows.length === 0 ? <Empty text="No listings on this page." />
        : (
          <>
            <div className={s.list}>
              {rows.map(r => {
                const b = buy?.saleId === r.saleId ? buy : null
                const btn = b?.stage === 'working' ? 'Buying…' : b?.stage === 'done' ? 'Bought ✓' : b?.stage === 'confirm' ? `Confirm • ${price(r.price)} $WAX` : 'Buy'
                return (
                  <div key={r.saleId} className={s.listRow}>
                    <b>{price(r.price)} $WAX <span style={{ color: '#7fc8ff', fontWeight: 600, fontSize: 12 }}>{usdText(r.price)}</span></b>
                    <span className={s.listMeta}>seller {r.seller}</span>
                    <span>
                      <button className={`${s.btn} ${b?.stage === 'confirm' ? s.btnPrimary : s.btnGhost}`} disabled={b?.stage === 'working' || b?.stage === 'done'} onClick={() => onBuy(r)}>{btn}</button>
                      {b?.stage === 'err' && <span style={{ display: 'block', fontSize: 10, color: '#ff6b6b', marginTop: 3 }}>{b.msg}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
            <Pager page={page} setPage={setPage} hasNext={rows.length === 20} loading={loading} />
          </>
        )}
    </Card>
  )
}

function Pager({ page, setPage, hasNext, loading }: { page: number; setPage: (n: number) => void; hasNext: boolean; loading: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
      <button className={`${s.btn} ${s.btnGhost}`} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>← Prev</button>
      <span style={{ fontSize: 13, color: MUTED }}>Page {page}</span>
      <button className={`${s.btn} ${s.btnGhost}`} disabled={!hasNext || loading} onClick={() => setPage(page + 1)}>Next →</button>
    </div>
  )
}
