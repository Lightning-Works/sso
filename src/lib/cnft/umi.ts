/**
 * The umi instance for the shared cNFT module.
 *
 * Adapted from crunk.fun's proven minting model. Uses Bubblegum V2 (mplBubblegum) +
 * MPL Core (mplCore, which is how V2 collections work).
 *
 * NOTE on DAS: we do NOT install/use `@metaplex-foundation/digital-asset-standard-api`
 * here. crunk documented that no version combination makes `getAssetWithProof` work
 * reliably across the pinned stack; DAS is reached over raw JSON-RPC instead (see das.ts).
 * This module runs on umi 1.5.x, which the V2 mint/collection/tree path is compatible with
 * (mpl-token-metadata, the package that caps umi at <1, is not on this path).
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum'
import { mplCore } from '@metaplex-foundation/mpl-core'
import type { Umi } from '@metaplex-foundation/umi'

export function createMintingUmi(rpcUrl: string): Umi {
  return createUmi(rpcUrl).use(mplBubblegum()).use(mplCore())
}
