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

/**
 * AWW-enriched NFT item: the shared NftItem plus the extra on-chain fields our
 * custom detail modal shows (schema, template, mint date, owner) and the full
 * raw immutable data so the collapsible "NFT Attributes" can list everything.
 * `floorWax` is filled in later by the pricing pass (nftPrices.ts).
 */
export type AwNft = NftItem & {
  schema?: string
  templateId?: string | null
  mintedAt?: string | null
  owner?: string
  floorWax?: number | null
  raw?: Record<string, unknown>
}

const AA = 'https://wax.api.atomicassets.io/atomicassets/v1/assets'
const PAGE = 100

function resolve(hash: unknown): string | null {
  const s = typeof hash === 'string' ? hash : ''
  if (!s) return null
  // dweb.link first (ipfs.io is unreliable under load); AwMedia gateway-walks on error.
  return s.startsWith('http') ? s : `https://dweb.link/ipfs/${s}`
}

export async function fetchNftItems(account: string, schema?: string): Promise<AwNft[]> {
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
    const sch = (a.schema as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((a.data as Record<string, unknown>) || {}) }
    const coll = (a.collection as Record<string, unknown>) || {}
    const mintedMs = a.minted_at_time ? Number(a.minted_at_time) : 0
    return {
      id: String(a.asset_id || ''),
      name: String(im.name || 'NFT'),
      imageUrl: resolve(im.img ?? im.image),
      videoUrl: resolve(im.video),
      thumbUrl: null,
      collection: String(coll.name || coll.collection_name || 'Alien Worlds'),
      description: im.description ? String(im.description) : null,
      rarity: (im.rarity as string) || (im.shine as string) || null,
      shine: (im.shine as string) || null,
      mintNumber: (a.template_mint as string) || null,
      maxSupply: tpl.max_supply ? String(tpl.max_supply) : null,
      chain: 'WAX',
      tokenId: String(a.asset_id || ''),
      externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${a.asset_id}`,
      schema: String(sch.schema_name || ''),
      templateId: tpl.template_id ? String(tpl.template_id) : null,
      mintedAt: mintedMs ? new Date(mintedMs).toISOString() : null,
      owner: String(a.owner || account),
      floorWax: null,
      raw: im,
      attributes: Object.entries(im).map(([key, value]) => ({ key, value: String(value) })),
    } as AwNft
  })
}
