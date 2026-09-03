/**
 * Marketplace data — live on-chain listings from AtomicMarket.
 *
 * Alien Worlds NFTs are AtomicAssets; the marketplaces (AtomicHub, NeftyBlocks)
 * are front-ends over the on-chain `atomicmarket` contract. Listings are public
 * and queryable here; buy/list/cancel map to atomicmarket::purchasesale /
 * announcesale / cancelsale (signable via the WAX session), so we surface them
 * natively — no need to build our own marketplace.
 */

import type { Tool } from './tools'
import type { AwNft } from './nftItems'

export type Listing = {
  saleId: string
  price: number
  symbol: string
  name: string
  schema: string
  templateId: number
  seller: string
  assetId: string
  imageUrl: string | null
  shine: string | null
}

/** IPFS hash → dweb.link URL (matches the wallet's NFT image handling). */
function imgUrl(hash?: unknown): string | null {
  const h = typeof hash === 'string' ? hash : ''
  if (!h) return null
  return h.startsWith('http') ? h : `https://dweb.link/ipfs/${h}`
}

/** A buyable tool: full stat block + its cheapest WAX listing price. */
export type ToolOffer = Tool & { price: number; symbol: string; saleId: string }

/**
 * Cheapest live listing per tool template (for the purchase advisor). Sorted by
 * price ascending, so the first time we see a template it's its floor price.
 */
export async function fetchToolOffers(limit = 100): Promise<ToolOffer[]> {
  const p = new URLSearchParams({
    collection_name: 'alien.worlds', schema_name: 'tool.worlds',
    state: '1', sort: 'price', order: 'asc', symbol: 'WAX', limit: String(limit),
  })
  const r = await fetch(`https://wax.api.atomicassets.io/atomicmarket/v1/sales?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load tool offers')
  const d = await r.json()

  const seen = new Set<number>()
  const offers: ToolOffer[] = []
  for (const s of (d.data || []) as Record<string, unknown>[]) {
    const asset = ((s.assets as Record<string, unknown>[]) || [{}])[0] || {}
    const tpl = (asset.template as Record<string, unknown>) || {}
    const templateId = Number(tpl.template_id) || 0
    if (!templateId || seen.has(templateId)) continue
    seen.add(templateId)
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((asset.data as Record<string, unknown>) || {}) }
    const price = (s.price as Record<string, unknown>) || {}
    const num = (v: unknown) => Number(v) || 0
    offers.push({
      assetId: String(asset.asset_id || ''),
      templateId,
      name: String(im.name || 'Tool'),
      rarity: String(im.rarity || ''),
      shine: String(im.shine || ''),
      delay: num(im.delay), ease: num(im.ease), luck: num(im.luck), difficulty: num(im.difficulty),
      img: im.img ? String(im.img) : undefined,
      price: num(price.amount) / 10 ** (num(price.token_precision) || 8),
      symbol: String(price.token_symbol || 'WAX'),
      saleId: String(s.sale_id || ''),
    })
  }
  return offers
}

const AMKT = 'https://wax.api.atomicassets.io/atomicmarket/v1'

/** A stacked template row: floor + how many are listed (one card per design). */
export type TemplateStack = {
  templateId: number
  name: string
  img: string | null
  rarity: string
  shine: string
  schema: string
  floor: number
  count: number
}

/**
 * Template-grouped listings ("stacked"): one row per template with its floor
 * price, plus the exact number listed. There are only ~700 templates, and each
 * design's image is shared, so we key art by template_id — no duplicate image
 * downloads across the thousands of identical mints. Paginated.
 */
export async function fetchTemplateStacks(opts: { schema?: string; page?: number; limit?: number } = {}): Promise<TemplateStack[]> {
  const p = new URLSearchParams({
    collection_name: 'alien.worlds', symbol: 'WAX', state: '1',
    sort: 'price', order: 'asc',
    page: String(opts.page || 1), limit: String(opts.limit || 24),
  })
  if (opts.schema) p.set('schema_name', opts.schema)
  const r = await fetch(`${AMKT}/sales/templates?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load marketplace')
  const d = await r.json()

  const base: TemplateStack[] = ((d.data || []) as Record<string, unknown>[]).map(s => {
    const asset = ((s.assets as Record<string, unknown>[]) || [{}])[0] || {}
    const tpl = (asset.template as Record<string, unknown>) || {}
    const sch = (asset.schema as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((asset.data as Record<string, unknown>) || {}) }
    const price = (s.price as Record<string, unknown>) || {}
    return {
      templateId: Number(tpl.template_id) || 0,
      name: String(asset.name || im.name || 'NFT'),
      img: imgUrl(im.img ?? im.image),
      rarity: String(im.rarity || ''),
      shine: String(im.shine || ''),
      schema: String(sch.schema_name || ''),
      floor: Number(price.amount || 0) / 10 ** (Number(price.token_precision) || 8),
      count: 0,
    }
  }).filter(t => t.templateId)

  // Exact listed-count per template (tiny count=true calls, in parallel).
  await Promise.all(base.map(async t => {
    try {
      const cr = await fetch(`${AMKT}/sales?collection_name=alien.worlds&template_id=${t.templateId}&state=1&symbol=WAX&count=true`)
      const cd = await cr.json()
      t.count = Number(cd.data) || 0
    } catch { /* leave 0 */ }
  }))
  return base
}

/** A for-sale NFT enriched to the full NFT shape (for the detail modal) plus its sale. */
export type SaleNft = AwNft & { saleId: string; priceWax: number }

/**
 * Individual listings of ONE template as rich NFT cards (openable in the detail
 * modal). All share the same design art — the caller keys the thumbnail by
 * template so the identical image is fetched once, not per mint.
 */
export async function fetchTemplateListings(templateId: number, page = 1, limit = 24): Promise<SaleNft[]> {
  const p = new URLSearchParams({
    collection_name: 'alien.worlds', template_id: String(templateId), state: '1', symbol: 'WAX',
    sort: 'price', order: 'asc', page: String(page), limit: String(limit),
  })
  const r = await fetch(`${AMKT}/sales?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load listings')
  const d = await r.json()
  return ((d.data || []) as Record<string, unknown>[]).map(s => {
    const asset = ((s.assets as Record<string, unknown>[]) || [{}])[0] || {}
    const tpl = (asset.template as Record<string, unknown>) || {}
    const sch = (asset.schema as Record<string, unknown>) || {}
    const coll = (asset.collection as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((asset.data as Record<string, unknown>) || {}) }
    const priceObj = (s.price as Record<string, unknown>) || {}
    const mintedMs = asset.minted_at_time ? Number(asset.minted_at_time) : 0
    return {
      id: String(asset.asset_id || s.sale_id || ''),
      tokenId: String(asset.asset_id || ''),
      name: String(asset.name || im.name || 'NFT'),
      imageUrl: imgUrl(im.img ?? im.image),
      thumbUrl: null,
      videoUrl: imgUrl(im.video),
      collection: String(coll.name || 'Alien Worlds'),
      description: im.description ? String(im.description) : null,
      rarity: (im.rarity as string) || (im.shine as string) || null,
      shine: (im.shine as string) || null,
      mintNumber: (asset.template_mint as string) || null,
      maxSupply: tpl.max_supply ? String(tpl.max_supply) : null,
      chain: 'WAX',
      externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${asset.asset_id}`,
      schema: String(sch.schema_name || ''),
      templateId: tpl.template_id ? String(tpl.template_id) : null,
      mintedAt: mintedMs ? new Date(mintedMs).toISOString() : null,
      owner: String(asset.owner || s.seller || ''),
      floorWax: null,
      raw: im,
      attributes: Object.entries(im).map(([key, value]) => ({ key, value: String(value) })),
      saleId: String(s.sale_id || ''),
      priceWax: Number(priceObj.amount || 0) / 10 ** (Number(priceObj.token_precision) || 8),
    } as SaleNft
  })
}

export async function fetchListings(opts: { schema?: string; limit?: number; templateId?: number; page?: number } = {}): Promise<Listing[]> {
  const p = new URLSearchParams({
    collection_name: 'alien.worlds',
    state: '1', // listed
    sort: 'price', order: 'asc',
    symbol: 'WAX',
    page: String(opts.page || 1),
    limit: String(opts.limit || 40),
  })
  if (opts.schema) p.set('schema_name', opts.schema)
  if (opts.templateId) p.set('template_id', String(opts.templateId))

  const r = await fetch(`https://wax.api.atomicassets.io/atomicmarket/v1/sales?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load listings')
  const d = await r.json()

  return (d.data || []).map((s: Record<string, unknown>) => {
    const asset = ((s.assets as Record<string, unknown>[]) || [{}])[0] || {}
    const tpl = (asset.template as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((asset.data as Record<string, unknown>) || {}) }
    const price = (s.price as Record<string, unknown>) || {}
    const precision = Number(price.token_precision) || 8
    return {
      saleId: String(s.sale_id || ''),
      price: Number(price.amount || 0) / 10 ** precision,
      symbol: String(price.token_symbol || 'WAX'),
      name: String(asset.name || im.name || 'NFT'),
      schema: String(((asset.schema as Record<string, unknown>) || {}).schema_name || ''),
      templateId: Number(tpl.template_id || 0),
      seller: String(s.seller || ''),
      assetId: String(asset.asset_id || ''),
      imageUrl: imgUrl(im.img ?? im.image),
      shine: im.shine ? String(im.shine) : null,
    } as Listing
  })
}
