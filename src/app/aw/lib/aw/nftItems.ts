/**
 * Maps a WAX account's Alien Worlds NFTs into the SSO NftGrid's NftItem shape.
 *
 * Mirrors the SSO wax wallet's fetch + `waxToNftItems` mapping so the grid gets
 * the same rich fields (video, description, max supply, rarity, AtomicHub link).
 * Reliable image display comes from the SSO thumbnail proxy (useThumbnails →
 * /api/nft-thumbs), which downloads each image server-side once and serves a
 * cached webp from Supabase — raw ipfs.io is only a fallback.
 *
 * IMPORTANT — page size: that thumbnail proxy generates missing thumbs
 * synchronously, so a giant page (we used to ask for 1000) times out → no
 * thumbs → the grid falls back to slow ipfs.io and tiles go black. The SSO
 * wallet pages 100 at a time; we do the same. We also filter by schema at the
 * API (not client-side) so a category tab returns 100 of THAT schema.
 */
import type { NftItem } from '@/components/NftGrid'

const AA = 'https://wax.api.atomicassets.io/atomicassets/v1/assets'
const PAGE = 100

function resolve(hash: unknown): string | null {
  const s = typeof hash === 'string' ? hash : ''
  if (!s) return null
  return s.startsWith('http') ? s : `https://ipfs.io/ipfs/${s}`
}

export async function fetchNftItems(account: string, schema?: string): Promise<NftItem[]> {
  const p = new URLSearchParams({
    owner: account, collection_name: 'alien.worlds',
    page: '1', limit: String(PAGE), order: 'desc', sort: 'transferred',
  })
  if (schema) p.set('schema_name', schema)

  const r = await fetch(`${AA}?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load collectibles')
  const d = await r.json()

  return (d.data || []).map((a: Record<string, unknown>) => {
    const tpl = (a.template as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((a.data as Record<string, unknown>) || {}) }
    const coll = (a.collection as Record<string, unknown>) || {}
    return {
      id: String(a.asset_id || ''),
      name: String(im.name || 'NFT'),
      imageUrl: resolve(im.img ?? im.image),
      videoUrl: resolve(im.video),
      thumbUrl: null,
      collection: String(coll.name || coll.collection_name || 'Alien Worlds'),
      description: im.description ? String(im.description) : null,
      rarity: (im.rarity as string) || (im.shine as string) || null,
      mintNumber: (a.template_mint as string) || null,
      maxSupply: tpl.max_supply ? String(tpl.max_supply) : null,
      chain: 'WAX',
      tokenId: String(a.asset_id || ''),
      externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${a.asset_id}`,
      attributes: Object.entries(im)
        .filter(([k]) => !['name', 'img', 'image', 'video', 'backimg', 'description', 'rarity', 'Rarity'].includes(k))
        .map(([key, value]) => ({ key, value: String(value) })),
    } as NftItem
  })
}
