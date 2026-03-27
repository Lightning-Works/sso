/**
 * EVM NFT Fetcher via Alchemy API
 * Returns NFTs for an EVM address across supported chains
 */

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY

const CHAINS: Record<string, { url: string; name: string }> = {
  ethereum: {
    url: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Ethereum',
  },
  polygon: {
    url: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Polygon',
  },
  base: {
    url: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Base',
  },
}

export interface EvmNft {
  tokenId: string
  name: string
  description: string | null
  imageUrl: string | null
  collectionName: string
  contractAddress: string
  chain: string
  tokenType: string
  floorPrice: number | null
}

export async function getEvmNfts(address: string, chain?: string): Promise<EvmNft[]> {
  const chains = chain ? { [chain]: CHAINS[chain] } : CHAINS
  const allNfts: EvmNft[] = []

  await Promise.all(
    Object.entries(chains).map(async ([chainKey, config]) => {
      if (!config) return
      try {
        let pageKey: string | undefined
        let pages = 0
        const MAX_PAGES = 5  // Up to 500 NFTs per chain

        do {
          const params = new URLSearchParams({
            owner: address,
            withMetadata: 'true',
            pageSize: '100',
          })
          if (pageKey) params.set('pageKey', pageKey)

          const res = await fetch(`${config.url}/getNFTsForOwner?${params}`)
          if (!res.ok) break

          const data = await res.json()
          const nfts = data.ownedNfts || []

          for (const nft of nfts) {
            const image = nft.image?.cachedUrl || nft.image?.thumbnailUrl ||
              nft.image?.pngUrl || nft.image?.originalUrl || null

            allNfts.push({
              tokenId: nft.tokenId || '',
              name: nft.name || nft.contract?.name || `#${nft.tokenId || '?'}`,
              description: nft.description || null,
              imageUrl: image,
              collectionName: nft.contract?.name || nft.collection?.name || 'Unknown',
              contractAddress: nft.contract?.address || '',
              chain: config.name,
              tokenType: nft.tokenType || 'ERC721',
              floorPrice: nft.contract?.openSeaMetadata?.floorPrice || null,
            })
          }

          pageKey = data.pageKey || undefined
          pages++
        } while (pageKey && pages < MAX_PAGES)

      } catch {
        // silently skip failed chain
      }
    })
  )

  return allNfts
}
