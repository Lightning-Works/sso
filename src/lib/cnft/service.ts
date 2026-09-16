/**
 * High-level generic cNFT operations. Adapted from crunk.fun's minting model, decoupled from
 * its database and event bus. This is the shared API every app (crunk, DiviGo, etc.) calls.
 *
 * Every on-chain action is delegated to a TreasurySigner (the module holds no key). Nothing
 * here persists state; the on-chain tx signature is the source of truth. Callers that want a
 * DB record do it at their own layer (e.g. an API route).
 */
import { findLeafAssetIdPda } from '@metaplex-foundation/mpl-bubblegum'
import { publicKey, type Umi } from '@metaplex-foundation/umi'
import { buildCreateCollection, buildCreateTree, buildMintCnft, type CreatorShare } from './builders'
import { waitForTreeConfig, parseLeafWithRetry } from './chain/races'
import type { TreeSpec } from './trees/strategy'
import { TREE_PLAN } from './trees/strategy'
import type { TreasurySigner } from './treasury/types'

export interface MintingContext {
  umi: Umi
  signer: TreasurySigner
  /** Default royalty recipient when metadata declares no creators. */
  royaltyWallet?: string
}

export interface CreateCollectionResult {
  collectionAddress: string
  signature: string
}

/**
 * Create an MPL Core collection for a game/token. Run once per collection; store the address.
 * `idempotencyKey` must be stable for the collection so a retry replays rather than creating a
 * second one. `declaredUsd` is what the isolated signer checks against simulation (the local
 * dev signer ignores it).
 */
export async function createCollection(
  ctx: MintingContext,
  input: {
    name: string
    uri: string
    sellerFeeBasisPoints: number
    idempotencyKey: string
    declaredUsd?: string
    royaltyWallet?: string
  }
): Promise<CreateCollectionResult> {
  const treasury = await ctx.signer.pubkey()
  const { builder, collectionSigner } = buildCreateCollection(ctx.umi, {
    name: input.name,
    uri: input.uri,
    sellerFeeBasisPoints: input.sellerFeeBasisPoints,
    treasury,
    royaltyWallet: input.royaltyWallet ?? ctx.royaltyWallet,
  })
  const res = await ctx.signer.signOpenTreeDepth({
    idempotencyKey: input.idempotencyKey,
    declaredUsd: input.declaredUsd ?? '0',
    builder,
    additionalSigners: [collectionSigner],
    purpose: 'tree_creation',
    capCategory: 'tree_creation',
  })
  return { collectionAddress: collectionSigner.publicKey, signature: res.signature }
}

export interface CreateTreeResult {
  treeAddress: string
  signature: string
  spec: TreeSpec
}

/**
 * Create a V2 Bubblegum tree. Defaults to the depth-14 plan spec (16,384 slots, composable).
 * Waits for the tree-config PDA to become visible before returning (RACE 1), so the tree is
 * safe to mint into immediately after.
 */
export async function createTree(
  ctx: MintingContext,
  input: {
    idempotencyKey: string
    spec?: TreeSpec
    declaredUsd?: string
  }
): Promise<CreateTreeResult> {
  const spec = input.spec ?? TREE_PLAN[TREE_PLAN.length - 1]!
  const { builder, merkleTreeSigner } = await buildCreateTree(ctx.umi, spec)
  const res = await ctx.signer.signOpenTreeDepth({
    idempotencyKey: input.idempotencyKey,
    declaredUsd: input.declaredUsd ?? '0',
    builder,
    additionalSigners: [merkleTreeSigner],
    purpose: 'tree_creation',
    capCategory: 'tree_creation',
  })
  await waitForTreeConfig(ctx.umi, merkleTreeSigner.publicKey)
  return { treeAddress: merkleTreeSigner.publicKey, signature: res.signature, spec }
}

export interface MintCnftResult {
  assetId: string
  signature: string
}

/**
 * Mint a V2 cNFT into `treeAddress`, in `collectionAddress`, owned by `owner`. Resolves the
 * real leaf index by parsing the confirmed mint tx (RACE 2), then derives the asset id
 * deterministically. `idempotencyKey` protects against double-mint on retry.
 */
export async function mintCnft(
  ctx: MintingContext,
  input: {
    treeAddress: string
    collectionAddress: string
    owner: string
    name: string
    uri: string
    symbol?: string
    sellerFeeBasisPoints: number
    creators?: CreatorShare[]
    idempotencyKey: string
    declaredUsd?: string
  }
): Promise<MintCnftResult> {
  const treasury = await ctx.signer.pubkey()
  const creators =
    input.creators && input.creators.length > 0
      ? input.creators
      : [{ address: ctx.royaltyWallet ?? treasury, share: 100 }]

  const builder = buildMintCnft(ctx.umi, {
    treeAddress: input.treeAddress,
    collectionAddress: input.collectionAddress,
    owner: input.owner,
    // Treasury is the collection authority. In the local signer this is umi.identity (the
    // treasury keypair); in the isolated-signer model umi.identity is a noop signer of the
    // treasury pubkey and the real signature is added remotely.
    collectionAuthority: ctx.umi.identity,
    name: input.name,
    symbol: input.symbol ?? '',
    uri: input.uri,
    sellerFeeBasisPoints: input.sellerFeeBasisPoints,
    creators,
  })

  const res = await ctx.signer.signMint({
    idempotencyKey: input.idempotencyKey,
    declaredUsd: input.declaredUsd ?? '0',
    builder,
  })

  const leaf = await parseLeafWithRetry(ctx.umi, res.signature)
  const [assetId] = findLeafAssetIdPda(ctx.umi, {
    merkleTree: publicKey(input.treeAddress),
    leafIndex: leaf.nonce,
  })
  return { assetId: assetId.toString(), signature: res.signature }
}
