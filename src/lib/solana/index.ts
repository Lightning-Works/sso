// Portable cNFT module: single entry point for the whole ecosystem's compressed-NFT
// minting and transfer-building. Import from here.
//
//   import { createCollectionTree, mintCnft, buildCnftTransfer } from '@/lib/solana'
//
// This folder is self-contained (no host-app imports). See ./config.ts for the two
// env values it needs and ./README.md for how to move it to another app.
export { createCollectionTree, mintCnft } from './mint'
export type { CreateTreeResult, MintCnftInput, MintCnftResult } from './mint'
export { buildCnftTransfer } from './transfer'
export type { BuildCnftTransferInput, BuildCnftTransferResult } from './transfer'
export { getSolanaRpc } from './config'
