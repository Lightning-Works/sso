'use client'

/**
 * Marketplace — template-first ("stacked"): one card per design (art, how many
 * listed, floor). Clicking a design drills into its individual listings as a card
 * grid, each openable in the detail modal and buyable, with column control and
 * pagination. Art is keyed by template so identical mints reuse one cached image.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { ShineBadge } from '@/components/ShineBadge'
import { NftDetailModal } from '../ui/NftDetailModal'
import { fetchTemplateStacks, fetchTemplateListings, type TemplateStack, type SaleNft } from '../lib/aw/market'
import { buildBuyActions } from '../lib/aw/buyTool'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { usePrices } from '../lib/aw/usePrices'
import type { NftItem } from '@/components/NftGrid'

const MUTED = 'var(--aww-text-muted, #9aa)'
const STACK_PAGE = 24
const DRILL_PAGE = 24
const COL_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 15, 20]
const price = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })
const templateFromUrl = (): number | null => { try { const v = new URLSearchParams(window.location.search).get('template'); return v ? Number(v) || null : null } catch { return null } }

export default function Market({ schema, label }: { schema?: string; label?: string }) {
  const [drill, setDrill] = useState<number | null>(null)
  const prices = usePrices()
  const usdText = (wax: number) => { const v = prices?.wax ? wax * prices.wax : null; return v == null ? '' : (v >= 0.01 ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toFixed(4)}`) }

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

/** Responsive column count: honor the choice, but cap to what fits the width. */
function useGridCols(selected: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const cols = w > 0 ? Math.max(1, Math.min(selected, Math.floor(w / 64))) : selected
  return { ref, cols }
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
    fetchTemplateStacks({ schema, page, limit: STACK_PAGE }).then(setStacks).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
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
            <Pager page={page} setPage={setPage} hasNext={stacks.length === STACK_PAGE} loading={loading} />
          </>
        )}
    </Card>
  )
}

// ─────────────────────────── Drill-down (card grid) ───────────────────────────
function DrillView({ templateId, onBack, usdText }: { templateId: number; onBack: () => void; usdText: (n: number) => string }) {
  const [page, setPage] = useState(1)
  const [nfts, setNfts] = useState<SaleNft[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buy, setBuy] = useState<{ saleId: string; stage: 'confirm' | 'working' | 'done' | 'err'; msg?: string } | null>(null)
  const [selected, setSelected] = useState<SaleNft | null>(null)
  const [cols, setCols] = useState(6)
  const { fetchThumbs, applyThumbs, thumbsLoading } = useThumbnails()
  const grid = useGridCols(cols)

  useEffect(() => { try { const v = Number(localStorage.getItem('aww-market-cols')); if (COL_OPTIONS.includes(v)) setCols(v) } catch { /* ignore */ } }, [])
  const chooseCols = (c: number) => { setCols(c); try { localStorage.setItem('aww-market-cols', String(c)) } catch { /* ignore */ } }

  useEffect(() => { setPage(1) }, [templateId])
  useEffect(() => {
    setLoading(true); setError('')
    fetchTemplateListings(templateId, page, DRILL_PAGE).then(setNfts).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
  }, [templateId, page])

  // All listings share ONE design image → fetch a single thumbnail for the template.
  const one = nfts?.[0]
  useEffect(() => { if (one?.imageUrl) fetchThumbs([{ id: String(templateId), name: one.name, imageUrl: one.imageUrl, chain: 'WAX', collection: 'Alien Worlds' }], 'aww-market') }, [templateId, one, fetchThumbs])
  const tImg = useMemo(() => applyThumbs([{ id: String(templateId), name: one?.name || '', imageUrl: one?.imageUrl ?? null, chain: 'WAX', collection: 'Alien Worlds' }])[0]?.thumbUrl || null, [templateId, one, applyThumbs])

  const onBuy = useCallback(async (r: SaleNft) => {
    const armed = buy?.saleId === r.saleId && buy.stage === 'confirm'
    if (!armed) { setBuy({ saleId: r.saleId, stage: 'confirm' }); return }
    setBuy({ saleId: r.saleId, stage: 'working' })
    try {
      if (!currentAccount()) await connectWax()
      const acct = currentAccount(); if (!acct) throw new Error('Connect your WAX wallet to buy')
      await transact(buildBuyActions(acct, r.saleId, r.priceWax))
      setBuy({ saleId: r.saleId, stage: 'done' })
      setTimeout(() => { setNfts(prev => (prev || []).filter(x => x.saleId !== r.saleId)); setBuy(null) }, 1600)
    } catch (e) { setBuy({ saleId: r.saleId, stage: 'err', msg: e instanceof Error ? e.message : 'Buy failed' }) }
  }, [buy])

  const name = one?.name || `Template ${templateId}`

  return (
    <Card tag="live · AtomicMarket">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={onBack} className={`${s.btn} ${s.btnGhost}`}>← All designs</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--aww-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <label style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
          Columns
          <select value={cols} onChange={e => chooseCols(Number(e.target.value))}
            style={{ background: 'color-mix(in srgb, var(--aww-text-muted) 10%, transparent)', color: 'var(--aww-text)', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}>
            {COL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {loading && !nfts ? <Empty text="Loading listings…" />
        : error ? <p className={s.err}>⚠ {error}</p>
        : !nfts || nfts.length === 0 ? <Empty text="No listings on this page." />
        : (
          <>
            <div ref={grid.ref} style={{ display: 'grid', gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gap: 10 }}>
              {nfts.map(r => {
                const b = buy?.saleId === r.saleId ? buy : null
                const btn = b?.stage === 'working' ? 'Buying…' : b?.stage === 'done' ? 'Bought ✓' : b?.stage === 'confirm' ? 'Confirm' : 'Buy'
                return (
                  <div key={r.saleId} onClick={() => setSelected(r)}
                    style={{ background: 'var(--nft-card-bg, #1a1a1c)', borderRadius: 10, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                    <NftThumb src={tImg} loading={!tImg && thumbsLoading} alt={r.name} radius={0} />
                    <div style={{ padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {cols <= 8 && <div style={{ fontSize: 11, color: MUTED }}>Mint #{r.mintNumber || '—'}</div>}
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 55%, #fff)' }}>{price(r.priceWax)} $WAX</div>
                      {cols <= 10 && usdText(r.priceWax) && <div style={{ fontSize: 10, color: '#7fc8ff' }}>{usdText(r.priceWax)}</div>}
                      <button className={`${s.btn} ${b?.stage === 'confirm' ? s.btnPrimary : s.btnGhost}`} style={{ marginTop: 2, fontSize: 11, padding: '3px 6px' }}
                        disabled={b?.stage === 'working' || b?.stage === 'done'}
                        onClick={(e) => { e.stopPropagation(); onBuy(r) }}
                        title={b?.stage === 'confirm' ? `Confirm ${price(r.priceWax)} $WAX` : 'Buy'}>
                        {btn}
                      </button>
                      {b?.stage === 'err' && <div style={{ fontSize: 9, color: '#ff6b6b' }}>{b.msg}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pager page={page} setPage={setPage} hasNext={nfts.length === DRILL_PAGE} loading={loading} />
          </>
        )}

      {selected && <NftDetailModal nft={selected} onClose={() => setSelected(null)} />}
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
