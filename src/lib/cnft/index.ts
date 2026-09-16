/**
 * Shared cNFT module (Bubblegum V2 + MPL Core), based on crunk.fun's proven model.
 *
 * Single entry point for the ecosystem's compressed-NFT minting. Self-contained: no host-app
 * imports, no database, no event bus. The module holds NO signing key; all on-chain actions
 * are delegated to a TreasurySigner (LocalDevSigner for devnet, TreasuryHttpClient for the
 * isolated production signer). See ./README.md for how to move it or wire it into a host.
 */

// high-level API
export {
  createCollection,
  createTree,
  mintCnft,
  type MintingContext,
  type CreateCollectionResult,
  type CreateTreeResult,
  type MintCnftResult,
} from './service'

// umi + config
export { createMintingUmi } from './umi'
export {
  getSolanaRpc,
  solanaNetwork,
  signerMode,
  devKeypairFile,
  treasuryUrl,
  treasuryToken,
  defaultRoyaltyWallet,
  defaultSellerFeeBps,
  type SolanaNetwork,
  type SignerMode,
} from './config'

// signers (the seam)
export type { TreasurySigner, SignRequest, SignResult, SignEndpoint } from './treasury/types'
export { LocalDevSigner, classifySendFailure } from './treasury/localSigner'
export { TreasuryHttpClient, type TreasuryClientConfig } from './treasury/httpClient'

// tree strategy
export {
  TREE_PLAN,
  isComposable,
  nextTreeSpec,
  estimateTreeCost,
  lamportsToSol,
  type TreeSpec,
  type TreeCost,
} from './trees/strategy'

// DAS reads (raw JSON-RPC)
export {
  getAsset,
  getAssetProof,
  getAssetWithProofRaw,
  leafIndexFromProof,
  type DasAsset,
  type DasAssetProof,
} from './das'

// errors + builders (for advanced callers / future burn/upgrade/transfer)
export { MintError, isMintErrorCode, toMintError, type MintErrorCode } from './errors'
export {
  buildCreateCollection,
  buildCreateTree,
  buildMintCnft,
  type CreatorShare,
} from './builders'
