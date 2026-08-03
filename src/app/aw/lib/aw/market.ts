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

export type Listing = {
  saleId: string
  price: number
  symbol: string
  name: string
  schema: string
  templateId: number
  seller: string
  assetId: string
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

export async function fetchListings(opts: { schema?: string; limit?: number } = {}): Promise<Listing[]> {
  const p = new URLSearchParams({
    collection_name: 'alien.worlds',
    state: '1', // listed
    sort: 'price', order: 'asc',
    symbol: 'WAX',
    limit: String(opts.limit || 40),
  })
  if (opts.schema) p.set('schema_name', opts.schema)

  const r = await fetch(`https://wax.api.atomicassets.io/atomicmarket/v1/sales?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load listings')
  const d = await r.json()

  return (d.data || []).map((s: Record<string, unknown>) => {
    const asset = ((s.assets as Record<string, unknown>[]) || [{}])[0] || {}
    const price = (s.price as Record<string, unknown>) || {}
    const precision = Number(price.token_precision) || 8
    return {
      saleId: String(s.sale_id || ''),
      price: Number(price.amount || 0) / 10 ** precision,
      symbol: String(price.token_symbol || 'WAX'),
      name: String(asset.name || 'NFT'),
      schema: String(((asset.schema as Record<string, unknown>) || {}).schema_name || ''),
      templateId: Number(((asset.template as Record<string, unknown>) || {}).template_id || 0),
      seller: String(s.seller || ''),
      assetId: String(asset.asset_id || ''),
    } as Listing
  })
}
