/**
 * NFT fetchers using free APIs only.
 * Blockscout for EVM, Helius DAS for Solana, AtomicAssets for WAX.
 */

import { EVM_CHAINS, SOLANA_RPC, ATOMIC_API, SKALE_CHAINS, blockscoutFetch } from './rpc'

export interface BlockchainNft {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  videoUrl: string | null
  collection: string
  contractAddress: string
  chain: string
  chainKey: string
  tokenType: string
  rarity: string | null
  mintNumber: string | null
  maxSupply: string | null
  floorPrice: number | null
  attributes: { key: string; value: string }[]
  externalUrl: string | null
  walletAddress: string
}

// ── EVM (Blockscout) ──

async function fetchBlockscoutNfts(
  blockscoutApi: string,
  chainName: string,
  chainKey: string,
  walletAddress: string,
): Promise<BlockchainNft[]> {
  const nfts: BlockchainNft[] = []
  let nextParams = ''
  let pages = 0

  do {
    const url = `${blockscoutApi}/addresses/${walletAddress}/nft?type=ERC-721%2CERC-1155${nextParams}`
    const data = await blockscoutFetch(url)
    if (!data) break

    for (const item of (data.items || []) as Record<string, unknown>[]) {
      const token = (item.token || {}) as Record<string, unknown>
      const meta = (item.metadata || {}) as Record<string, unknown>
      const imageUrl = (item.image_url || item.media_url || meta.image || null) as string | null
      const videoUrl = (item.animation_url || meta.animation_url || null) as string | null

      const attrs = ((meta.attributes || []) as { trait_type?: string; value?: string }[])
        .filter(a => a.trait_type)
        .map(a => ({ key: a.trait_type!, value: String(a.value || '') }))

      nfts.push({
        id: `${token.address || ''}-${item.id || ''}`,
        name: (meta.name || token.name || `#${item.id || '?'}`) as string,
        description: (meta.description || null) as string | null,
        imageUrl,
        videoUrl,
        collection: (token.name || 'Unknown') as string,
        contractAddress: (token.address || '') as string,
        chain: chainName,
        chainKey,
        tokenType: (token.type || 'ERC721') as string,
        rarity: null,
        mintNumber: null,
        maxSupply: null,
        floorPrice: null,
        attributes: attrs,
        externalUrl: null,
        walletAddress,
      })
    }

    const np = data.next_page_params as Record<string, string> | undefined
    nextParams = np ? `&token_address_hash=${np.token_address_hash}&token_id=${np.token_id}` : ''
    pages++
  } while (nextParams && pages < 10)

  return nfts
}

export async function getEvmNfts(walletAddress: string): Promise<BlockchainNft[]> {
  const allNfts: BlockchainNft[] = []

  // Standard EVM chains
  const chainEntries = Object.entries(EVM_CHAINS).filter(([, c]) => c.blockscoutApi)
  await Promise.all(chainEntries.map(async ([key, chain]) => {
    try {
      const nfts = await fetchBlockscoutNfts(chain.blockscoutApi!, chain.name, key, walletAddress)
      allNfts.push(...nfts)
    } catch { /* skip failed chain */ }
  }))

  // SKALE chains
  await Promise.all(Object.entries(SKALE_CHAINS).map(async ([key, chain]) => {
    try {
      const nfts = await fetchBlockscoutNfts(chain.blockscoutApi, chain.name, `skale_${key}`, walletAddress)
      allNfts.push(...nfts)
    } catch { /* skip */ }
  }))

  return allNfts
}

// ── Solana (Helius DAS) ──

export async function getSolanaNfts(walletAddress: string): Promise<BlockchainNft[]> {
  const allNfts: BlockchainNft[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= 5) {
      const res = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: `nfts-${page}`,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress, page, limit: 100,
            displayOptions: { showCollectionMetadata: true },
          },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) break
      const data = await res.json()
      const items = data.result?.items || []
      if (items.length === 0) { hasMore = false; break }

      for (const item of items) {
        const iface = item.interface || ''
        if (iface === 'FungibleToken' || iface === 'FungibleAsset') continue

        const content = item.content || {}
        const metadata = content.metadata || {}
        const files = content.files || []
        const links = content.links || {}
        const collection = item.grouping?.find(
          (g: { group_key: string; collection_metadata?: { name?: string } }) => g.group_key === 'collection'
        )

        // Image: prefer Helius CDN, then files, then links
        let imageUrl: string | null = null
        if (files.length > 0) {
          const imgFile = files.find((f: { mime?: string }) => f.mime?.startsWith('image/'))
          imageUrl = imgFile?.cdn_uri || imgFile?.uri || files[0]?.uri || null
        }
        if (!imageUrl && links.image) imageUrl = links.image
        if (!imageUrl && metadata.image) imageUrl = metadata.image
        if (imageUrl?.startsWith('ipfs://')) imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')

        const isCompressed = item.compression?.compressed === true
        const attrs = (metadata.attributes || [])
          .filter((a: { trait_type?: string }) => a.trait_type)
          .map((a: { trait_type: string; value?: string }) => ({ key: a.trait_type, value: String(a.value || '') }))

        const extUrl = links.external_url?.startsWith('http') ? links.external_url
          : metadata.external_url?.startsWith('http') ? metadata.external_url : null

        allNfts.push({
          id: item.id,
          name: metadata.name || content.name || `NFT ${item.id.slice(0, 8)}`,
          description: metadata.description || null,
          imageUrl,
          videoUrl: links.animation_url || null,
          collection: collection?.collection_metadata?.name || metadata.collection?.name || 'Unknown',
          contractAddress: item.id,
          chain: isCompressed ? 'Solana (cNFT)' : 'Solana',
          chainKey: 'solana',
          tokenType: isCompressed ? 'Compressed' : 'NFT',
          rarity: null,
          mintNumber: null,
          maxSupply: null,
          floorPrice: null,
          attributes: attrs,
          externalUrl: extUrl,
          walletAddress,
        })
      }

      page++
      if (items.length < 100) hasMore = false
    }
  } catch { /* skip */ }

  return allNfts
}

// ── WAX (AtomicAssets) ──

export async function getWaxNfts(walletAddress: string, collection?: string): Promise<BlockchainNft[]> {
  const allNfts: BlockchainNft[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= 5) {
      const params = new URLSearchParams({
        owner: walletAddress,
        page: String(page),
        limit: '100',
        order: 'desc',
        sort: 'transferred',
      })
      if (collection) params.set('collection_name', collection)

      const res = await fetch(`${ATOMIC_API}/atomicassets/v1/assets?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) break
      const json = await res.json()
      if (!json.success || !Array.isArray(json.data)) break
      if (json.data.length === 0) { hasMore = false; break }

      for (const asset of json.data) {
        const assetData = (asset.data || asset.immutable_data || {}) as Record<string, unknown>
        const col = (asset.collection || {}) as Record<string, unknown>
        const template = (asset.template || {}) as Record<string, unknown>
        const templateData = (template.immutable_data || {}) as Record<string, unknown>

        const imgHash = (assetData.img || assetData.image || templateData.img || templateData.image || null) as string | null
        let imageUrl: string | null = null
        if (imgHash) {
          imageUrl = imgHash.startsWith('http') ? imgHash
            : imgHash.startsWith('Qm') || imgHash.startsWith('bafy') ? `https://ipfs.io/ipfs/${imgHash}`
            : `https://ipfs.io/ipfs/${imgHash}`
        }
        const videoHash = (assetData.video || templateData.video || null) as string | null
        let videoUrl: string | null = null
        if (videoHash) {
          videoUrl = videoHash.startsWith('http') ? videoHash : `https://ipfs.io/ipfs/${videoHash}`
        }

        const attrs = Object.entries(assetData)
          .filter(([k]) => !['name', 'img', 'image', 'video', 'description', 'rarity', 'Rarity'].includes(k))
          .map(([k, v]) => ({ key: k, value: String(v) }))

        allNfts.push({
          id: asset.asset_id as string,
          name: (assetData.name || templateData.name || 'Unnamed') as string,
          description: (assetData.description || templateData.description || null) as string | null,
          imageUrl,
          videoUrl,
          collection: (col.name || col.collection_name || '') as string,
          contractAddress: (col.collection_name || '') as string,
          chain: 'WAX',
          chainKey: 'wax',
          tokenType: ((asset.schema as Record<string, unknown>)?.schema_name || '') as string,
          rarity: (assetData.rarity || assetData.Rarity || templateData.rarity || null) as string | null,
          mintNumber: (asset.template_mint || null) as string | null,
          maxSupply: (template.max_supply || null) as string | null,
          floorPrice: null,
          attributes: attrs,
          externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${asset.asset_id}`,
          walletAddress,
        })
      }

      page++
      if (json.data.length < 100) hasMore = false
    }
  } catch { /* skip */ }

  return allNfts
}
