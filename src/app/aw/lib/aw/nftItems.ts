/**
 * Maps a WAX account's Alien Worlds NFTs into the SSO NftGrid's NftItem shape.
 *
 * Reuses the SSO's proven fetcher (getWaxNfts) instead of a bespoke call, and
 * mirrors the SSO wax wallet's `waxToNftItems` mapping (src/app/wallet/wax/page.tsx)
 * so the AWW grid gets the same rich fields it shows there: video, description,
 * max supply, rarity and an AtomicHub explorer link. Thumbnails are filled in
 * separately by the useThumbnails hook (same /api/nft-thumbs the SSO uses).
 */
import type { NftItem } from '@/components/NftGrid'
import { getWaxNfts, type WaxNft } from '@/lib/wallets/balances/wax-nfts'

function toItems(nfts: WaxNft[]): NftItem[] {
  return nfts.map(nft => ({
    id: nft.assetId,
    name: nft.name,
    imageUrl: nft.imageUrl,
    videoUrl: nft.videoUrl,
    thumbUrl: null,
    collection: nft.collectionDisplayName || nft.collectionName,
    description: nft.description,
    rarity: nft.rarity,
    mintNumber: nft.mintNumber,
    maxSupply: nft.maxSupply,
    chain: 'WAX',
    tokenId: nft.assetId,
    externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${nft.assetId}`,
    attributes: Object.entries(nft.data)
      .filter(([k]) => !['name', 'img', 'image', 'video', 'backimg', 'description', 'rarity', 'Rarity'].includes(k))
      .map(([key, value]) => ({ key, value: String(value) })),
  })) as NftItem[]
}

export async function fetchNftItems(account: string, schema?: string): Promise<NftItem[]> {
  // Pull the whole Alien Worlds collection (up to 1000), then optionally scope
  // to one schema (land.worlds, tool.worlds, …) for the category tabs.
  const { nfts } = await getWaxNfts(account, 1, 1000, 'alien.worlds')
  const filtered = schema ? nfts.filter(n => n.schemaName === schema) : nfts
  return toItems(filtered)
}
