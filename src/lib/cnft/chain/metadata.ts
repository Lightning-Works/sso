/**
 * Metadata translation and proof assembly. Adapted from crunk.fun's spike-proven code.
 * Both halves silently produce wrong results if reimplemented from memory.
 */
import { publicKey, some, unwrapOption, type Umi } from '@metaplex-foundation/umi'
import type { MetadataArgsV2Args } from '@metaplex-foundation/mpl-bubblegum'
import { leafIndexFromProof, type DasAsset, type DasAssetProof } from '../das'

/** DAS returns hashes base58-encoded; umi instructions want raw bytes. */
export function b58ToBytes(umi: Umi, s: string): Uint8Array {
  return umi.serializer.publicKey().serialize(publicKey(s))
}

/**
 * The account/argument block that both updateMetadataV2 and burnV2 need.
 * canopyDepth MUST be passed for any tree with a canopy: the instruction expects a proof
 * WITHOUT the canopy levels and rejects a full one. DAS always returns the full proof.
 */
export function proofArgs(umi: Umi, asset: DasAsset, proof: DasAssetProof, canopyDepth = 0) {
  const index = leafIndexFromProof(proof)
  const truncated =
    canopyDepth > 0
      ? proof.proof.slice(0, Math.max(0, proof.proof.length - canopyDepth))
      : proof.proof

  return {
    leafOwner: publicKey(asset.ownership.owner),
    leafDelegate: publicKey(asset.ownership.delegate ?? asset.ownership.owner),
    root: b58ToBytes(umi, proof.root),
    dataHash: b58ToBytes(umi, asset.compression.data_hash),
    creatorHash: b58ToBytes(umi, asset.compression.creator_hash),
    nonce: asset.compression.leaf_id,
    index,
    proof: truncated.map((p) => publicKey(p)),
  }
}

/**
 * DAS-shaped metadata -> the V2 shape the instructions want. V1 (DAS) carries a
 * { key, verified } collection struct; V2 carries a bare PublicKey.
 */
export function metadataFromDas(asset: DasAsset, collection: string): MetadataArgsV2Args {
  return {
    name: asset.content.metadata.name,
    symbol: asset.content.metadata.symbol ?? '',
    uri: asset.content.json_uri,
    sellerFeeBasisPoints: asset.royalty.basis_points,
    primarySaleHappened: asset.royalty.primary_sale_happened,
    isMutable: asset.mutable,
    tokenStandard: some(0), // NonFungible
    creators: asset.creators.map((c) => ({
      address: publicKey(c.address),
      share: c.share,
      verified: c.verified,
    })),
    collection: some(publicKey(collection)),
  }
}

/** V1 -> V2 translation for metadata from mpl-bubblegum's own helper (kept for completeness). */
export function toV2Metadata(m: {
  name: string
  symbol: string
  uri: string
  sellerFeeBasisPoints: number
  primarySaleHappened: boolean
  isMutable: boolean
  tokenStandard: MetadataArgsV2Args['tokenStandard']
  creators: MetadataArgsV2Args['creators']
  collection: unknown
}): MetadataArgsV2Args {
  const col = unwrapOption(m.collection as never) as { key: string } | null
  return {
    name: m.name,
    symbol: m.symbol,
    uri: m.uri,
    sellerFeeBasisPoints: m.sellerFeeBasisPoints,
    primarySaleHappened: m.primarySaleHappened,
    isMutable: m.isMutable,
    tokenStandard: m.tokenStandard,
    creators: m.creators,
    collection: col ? some(publicKey(col.key)) : null,
  }
}
