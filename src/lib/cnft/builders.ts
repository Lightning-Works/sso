/**
 * Pure transaction BUILDERS for the V2 cNFT flow. Adapted from crunk.fun.
 *
 * These build umi transaction builders only; they do not sign, send, or touch any database.
 * Signing is delegated to a TreasurySigner (see ./service.ts and ./treasury/*). No private
 * key is used here beyond the throwaway ephemeral account keypairs a tree/collection must
 * sign its own creation with.
 */
import { createCollection, ruleSet } from '@metaplex-foundation/mpl-core'
import { createTreeV2, mintV2 } from '@metaplex-foundation/mpl-bubblegum'
import {
  generateSigner,
  publicKey,
  some,
  type KeypairSigner,
  type Signer,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi'
import type { TreeSpec } from './trees/strategy'

export interface CreatorShare {
  address: string
  share: number
  verified?: boolean
}

/**
 * Build an MPL Core collection for V2 cNFTs. MUST carry the BubblegumV2 and Royalties
 * plugins or every mint into it fails. The collection is a brand-new account and signs its
 * own creation via the returned ephemeral signer; its update authority becomes `treasury`.
 */
export function buildCreateCollection(
  umi: Umi,
  args: {
    name: string
    uri: string
    sellerFeeBasisPoints: number
    treasury: string
    royaltyWallet?: string
  }
): { builder: TransactionBuilder; collectionSigner: KeypairSigner } {
  const collectionSigner = generateSigner(umi)
  const royalty = args.royaltyWallet ?? args.treasury
  const builder = createCollection(umi, {
    collection: collectionSigner,
    name: args.name,
    uri: args.uri,
    updateAuthority: publicKey(args.treasury),
    plugins: [
      { type: 'BubblegumV2' },
      {
        type: 'Royalties',
        basisPoints: args.sellerFeeBasisPoints,
        creators: [{ address: publicKey(royalty), percentage: 100 }],
        ruleSet: ruleSet('None'),
      },
    ],
  })
  return { builder, collectionSigner }
}

/**
 * Build a V2 Bubblegum Merkle tree. The tree is a brand-new account and signs its own
 * creation via the returned ephemeral signer; its authority becomes the treasury. `public:
 * false` so only the treasury (mint authority) can append leaves it paid rent for.
 */
export async function buildCreateTree(
  umi: Umi,
  spec: TreeSpec
): Promise<{ builder: TransactionBuilder; merkleTreeSigner: KeypairSigner }> {
  const merkleTreeSigner = generateSigner(umi)
  const builder = await createTreeV2(umi, {
    merkleTree: merkleTreeSigner,
    maxDepth: spec.maxDepth,
    maxBufferSize: spec.maxBufferSize,
    canopyDepth: spec.canopyDepth,
    public: false,
  })
  return { builder, merkleTreeSigner }
}

/**
 * Build a V2 cNFT mint into `treeAddress`, owned by `owner`, belonging to the MPL Core
 * `collectionAddress`. `collectionAuthority` is the treasury (umi.identity in the local
 * signer; a noop signer of the treasury pubkey in the isolated-signer model). isMutable is
 * EXPLICITLY true so forge/upgrade can repoint metadata later (immutability is a one-way door).
 */
export function buildMintCnft(
  umi: Umi,
  args: {
    treeAddress: string
    collectionAddress: string
    owner: string
    collectionAuthority: Signer
    name: string
    symbol: string
    uri: string
    sellerFeeBasisPoints: number
    creators: CreatorShare[]
  }
): TransactionBuilder {
  const coreCollection = publicKey(args.collectionAddress)
  return mintV2(umi, {
    leafOwner: publicKey(args.owner),
    merkleTree: publicKey(args.treeAddress),
    coreCollection,
    collectionAuthority: args.collectionAuthority,
    metadata: {
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      sellerFeeBasisPoints: args.sellerFeeBasisPoints,
      isMutable: true,
      collection: some(coreCollection),
      // `verified` must be false unless that creator signs this tx; only the treasury signs.
      creators: args.creators.map((c) => ({
        address: publicKey(c.address),
        share: c.share,
        verified: false,
      })),
    },
  })
}
