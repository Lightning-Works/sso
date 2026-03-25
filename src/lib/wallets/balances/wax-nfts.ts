/**
 * WAX NFT Fetcher via AtomicAssets API
 * Returns NFTs for a WAX account with images and metadata
 */

const ATOMIC_API = 'https://wax.api.atomicassets.io'

export interface WaxNft {
  assetId: string
  name: string
  imageUrl: string | null
  videoUrl: string | null
  collectionName: string
  collectionDisplayName: string
  schemaName: string
  templateId: string | null
  mintNumber: string | null
  maxSupply: string | null
  rarity: string | null
  description: string | null
  isTransferable: boolean
  isBurnable: boolean
  mintedAt: string | null
  data: Record<string, unknown>
}

function resolveMediaUrl(hash: string | null | undefined): string | null {
  if (!hash) return null
  if (hash.startsWith('http')) return hash
  if (hash.startsWith('Qm') || hash.startsWith('bafy')) return `https://ipfs.io/ipfs/${hash}`
  return `https://ipfs.io/ipfs/${hash}`
}

export async function getWaxNfts(account: string, page = 1, limit = 100, collection?: string): Promise<{ nfts: WaxNft[]; total: number }> {
  try {
    let url = `${ATOMIC_API}/atomicassets/v1/assets?owner=${encodeURIComponent(account)}&page=${page}&limit=${limit}&order=desc&sort=transferred`
    if (collection) url += `&collection_name=${encodeURIComponent(collection)}`
    const res = await fetch(url)

    if (!res.ok) {
      console.error('AtomicAssets API error:', res.status)
      return { nfts: [], total: 0 }
    }

    const json = await res.json()
    if (!json.success || !Array.isArray(json.data)) {
      return { nfts: [], total: 0 }
    }

    const nfts: WaxNft[] = json.data.map((asset: Record<string, unknown>) => {
      const data = (asset.data || asset.immutable_data || {}) as Record<string, unknown>
      const collection = (asset.collection || {}) as Record<string, unknown>
      const template = (asset.template || {}) as Record<string, unknown>
      const templateData = (template.immutable_data || {}) as Record<string, unknown>

      const imgHash = (data.img || data.image || templateData.img || templateData.image || null) as string | null
      const videoHash = (data.video || templateData.video || null) as string | null

      return {
        assetId: asset.asset_id as string,
        name: (data.name || templateData.name || 'Unnamed') as string,
        imageUrl: resolveMediaUrl(imgHash),
        videoUrl: resolveMediaUrl(videoHash),
        collectionName: (collection.collection_name || '') as string,
        collectionDisplayName: (collection.name || collection.collection_name || '') as string,
        schemaName: ((asset.schema as Record<string, unknown>)?.schema_name || '') as string,
        templateId: (template.template_id || null) as string | null,
        mintNumber: (asset.template_mint || null) as string | null,
        maxSupply: (template.max_supply || null) as string | null,
        rarity: (data.rarity || data.Rarity || templateData.rarity || null) as string | null,
        description: (data.description || templateData.description || null) as string | null,
        isTransferable: asset.is_transferable as boolean,
        isBurnable: asset.is_burnable as boolean,
        mintedAt: (asset.minted_at_time || null) as string | null,
        data,
      }
    })

    return { nfts, total: json.data.length >= limit ? (page * limit + 1) : ((page - 1) * limit + json.data.length) }
  } catch (e) {
    console.error('WAX NFT fetch error:', e)
    return { nfts: [], total: 0 }
  }
}
