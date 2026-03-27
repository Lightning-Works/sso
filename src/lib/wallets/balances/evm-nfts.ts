/**
 * EVM NFT Fetcher
 * Alchemy API for Ethereum, Polygon, Base
 * Blockscout API for Core DAO, SKALE Nebula, SKALE Calypso
 */

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY

interface AlchemyChain { type: 'alchemy'; url: string; name: string }
interface BlockscoutChain { type: 'blockscout'; url: string; name: string }
type ChainConfig = AlchemyChain | BlockscoutChain

const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    type: 'alchemy',
    url: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Ethereum',
  },
  polygon: {
    type: 'alchemy',
    url: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Polygon',
  },
  base: {
    type: 'alchemy',
    url: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    name: 'Base',
  },
  core: {
    type: 'blockscout',
    url: 'https://scan.coredao.org/api/v2',
    name: 'Core',
  },
  skaleNebula: {
    type: 'blockscout',
    url: 'https://green-giddy-denebola.explorer.mainnet.skalenodes.com/api/v2',
    name: 'SKALE Nebula',
  },
}

export interface EvmNft {
  tokenId: string
  name: string
  description: string | null
  imageUrl: string | null
  videoUrl: string | null
  collectionName: string
  contractAddress: string
  chain: string
  tokenType: string
  floorPrice: number | null
  attributes: { key: string; value: string }[]
}

async function fetchAlchemyNfts(config: AlchemyChain, address: string): Promise<EvmNft[]> {
  const nfts: EvmNft[] = []
  let pageKey: string | undefined
  let pages = 0

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
    for (const nft of data.ownedNfts || []) {
      const image = nft.image?.cachedUrl || nft.image?.thumbnailUrl ||
        nft.image?.pngUrl || nft.image?.originalUrl || null

      nfts.push({
        tokenId: nft.tokenId || '',
        name: nft.name || nft.contract?.name || `#${nft.tokenId || '?'}`,
        description: nft.description || null,
        imageUrl: image,
        videoUrl: null,
        collectionName: nft.contract?.name || nft.collection?.name || 'Unknown',
        contractAddress: nft.contract?.address || '',
        chain: config.name,
        tokenType: nft.tokenType || 'ERC721',
        floorPrice: nft.contract?.openSeaMetadata?.floorPrice || null,
        attributes: [],
      })
    }

    pageKey = data.pageKey || undefined
    pages++
  } while (pageKey && pages < 5)

  return nfts
}

async function fetchBlockscoutNfts(config: BlockscoutChain, address: string): Promise<EvmNft[]> {
  const nfts: EvmNft[] = []
  let nextParams = ''
  let pages = 0

  do {
    const url = `${config.url}/addresses/${address}/nft?type=ERC-721%2CERC-1155${nextParams}`
    const res = await fetch(url)
    if (!res.ok) break

    const data = await res.json()
    for (const item of data.items || []) {
      const token = item.token || {}
      const meta = item.metadata || {}

      const imageUrl = item.image_url || item.media_url || meta.image || null
      const videoUrl = item.animation_url || meta.animation_url || null

      const attrs = (meta.attributes || []).map(
        (a: { trait_type?: string; value?: string }) => ({
          key: a.trait_type || '',
          value: String(a.value || ''),
        })
      ).filter((a: { key: string }) => a.key)

      nfts.push({
        tokenId: item.id || '',
        name: meta.name || token.name || `#${item.id || '?'}`,
        description: meta.description || null,
        imageUrl,
        videoUrl,
        collectionName: token.name || 'Unknown',
        contractAddress: token.address || '',
        chain: config.name,
        tokenType: token.type || 'ERC721',
        floorPrice: null,
        attributes: attrs,
      })
    }

    const np = data.next_page_params
    nextParams = np ? `&token_address_hash=${np.token_address_hash}&token_id=${np.token_id}` : ''
    pages++
  } while (nextParams && pages < 5)

  return nfts
}

export async function getEvmNfts(address: string, chain?: string): Promise<EvmNft[]> {
  const chains = chain ? { [chain]: CHAINS[chain] } : CHAINS
  const allNfts: EvmNft[] = []

  await Promise.all(
    Object.entries(chains).map(async ([, config]) => {
      if (!config) return
      try {
        const nfts = config.type === 'alchemy'
          ? await fetchAlchemyNfts(config, address)
          : await fetchBlockscoutNfts(config, address)
        allNfts.push(...nfts)
      } catch {
        // silently skip failed chain
      }
    })
  )

  return allNfts
}
