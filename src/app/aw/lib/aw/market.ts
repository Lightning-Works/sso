/**
 * Marketplace data — live on-chain listings from AtomicMarket.
 *
 * Alien Worlds NFTs are AtomicAssets; the marketplaces (AtomicHub, NeftyBlocks)
 * are front-ends over the on-chain `atomicmarket` contract. Listings are public
 * and queryable here; buy/list/cancel map to atomicmarket::purchasesale /
 * announcesale / cancelsale (signable via the WAX session), so we surface them
 * natively — no need to build our own marketplace.
 */

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
