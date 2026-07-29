/**
 * Maps a WAX account's Alien Worlds NFTs (AtomicAssets) into the SSO NftGrid's
 * NftItem shape, so we reuse the existing grid (glows, lightbox, comic/webtoon
 * reader) instead of building our own.
 */
import type { NftItem } from '@/components/NftGrid'

const ipfs = (h?: unknown): string | null =>
  typeof h === 'string' && h ? `https://atomichub-ipfs.com/ipfs/${h}` : null

export async function fetchNftItems(account: string, schema?: string): Promise<NftItem[]> {
  const p = new URLSearchParams({
    owner: account, collection_name: 'alien.worlds',
    page: '1', limit: '200', order: 'desc', sort: 'transferred',
  })
  if (schema) p.set('schema_name', schema)

  const r = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?${p.toString()}`)
  if (!r.ok) throw new Error('failed to load collectibles')
  const d = await r.json()

  return (d.data || []).map((a: Record<string, unknown>) => {
    const tpl = (a.template as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((a.data as Record<string, unknown>) || {}) }
    const img = ipfs(im.img) || ipfs(im.image)
    const coll = (a.collection as Record<string, unknown>) || {}
    return {
      id: String(a.asset_id || ''),
      name: String(im.name || a.name || 'NFT'),
      imageUrl: img,
      thumbUrl: img,
      collection: String(coll.collection_name || 'alien.worlds'),
      rarity: (im.rarity as string) || (im.shine as string) || null,
      mintNumber: (a.template_mint as string) || null,
      chain: 'WAX',
      tokenId: String(a.asset_id || ''),
      attributes: Object.entries(im)
        .filter(([k]) => !['img', 'image', 'backimg', 'name'].includes(k))
        .map(([key, value]) => ({ key, value: String(value) })),
    } as NftItem
  })
}
