/**
 * Solana NFT Fetcher via Helius DAS API
 * Supports both regular NFTs and compressed NFTs (cNFTs)
 */

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`

export interface SolanaNft {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  collection: string
  isCompressed: boolean
  royaltyPercent: number | null
  attributes: { key: string; value: string }[]
  externalUrl: string | null
}

export async function getSolanaNfts(address: string): Promise<SolanaNft[]> {
  if (!HELIUS_KEY) {
    console.error('Helius API key not configured')
    return []
  }

  const allNfts: SolanaNft[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= 5) {
      const res = await fetch(HELIUS_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `nfts-${page}`,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page,
            limit: 100,
            displayOptions: {
              showCollectionMetadata: true,
              showUnverifiedCollections: false,
            },
          },
        }),
      })

      if (!res.ok) {
        console.error('Helius DAS API error:', res.status)
        break
      }

      const data = await res.json()
      const items = data.result?.items || []

      if (items.length === 0) {
        hasMore = false
        break
      }

      for (const item of items) {
        // Skip fungible tokens — only want NFTs
        const iface = item.interface || ''
        if (iface === 'FungibleToken' || iface === 'FungibleAsset') continue

        const content = item.content || {}
        const metadata = content.metadata || {}
        const files = content.files || []
        const links = content.links || {}
        const collection = item.grouping?.find(
          (g: { group_key: string; group_value: string; collection_metadata?: { name?: string } }) => g.group_key === 'collection'
        )

        // Resolve image: prefer Helius CDN, then files, then links, then metadata
        let imageUrl: string | null = null

        // Try Helius CDN cached version first (survives origin outages)
        if (files.length > 0) {
          const imgFile = files.find((f: { mime?: string }) => f.mime?.startsWith('image/'))
          const cdnUrl = imgFile?.cdn_uri || (files[0] as { cdn_uri?: string })?.cdn_uri
          if (cdnUrl) imageUrl = cdnUrl
          if (!imageUrl) imageUrl = imgFile?.uri || files[0]?.uri || null
        }
        if (!imageUrl && links.image) imageUrl = links.image
        if (!imageUrl && metadata.image) imageUrl = metadata.image

        // Fix IPFS URLs
        if (imageUrl && imageUrl.startsWith('ipfs://')) {
          imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')
        }

        const attrs = (metadata.attributes || []).map(
          (a: { trait_type?: string; value?: string }) => ({
            key: a.trait_type || '',
            value: String(a.value || ''),
          })
        ).filter((a: { key: string }) => a.key)

        allNfts.push({
          id: item.id,
          name: metadata.name || content.name || `NFT ${item.id.slice(0, 8)}`,
          description: metadata.description || null,
          imageUrl,
          collection: collection?.collection_metadata?.name || metadata.collection?.name || 'Unknown',
          isCompressed: item.compression?.compressed === true,
          royaltyPercent: item.royalty?.percent != null ? item.royalty.percent : null,
          attributes: attrs,
          externalUrl: (links.external_url && links.external_url.startsWith('http') ? links.external_url : null)
            || (metadata.external_url && metadata.external_url.startsWith('http') ? metadata.external_url : null)
            || null,
        })
      }

      page++
      if (items.length < 100) hasMore = false
    }
  } catch (e) {
    console.error('Solana NFT fetch error:', e)
  }

  return allNfts
}
