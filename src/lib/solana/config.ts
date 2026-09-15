// Self-contained config for the portable cNFT module.
//
// PORTABILITY: this whole folder (src/lib/solana/) is a single, self-contained
// cNFT minting/transfer module with NO host-app imports. To move it to another
// Node app (GoBanq, a standalone service, etc.), copy the folder and provide the
// env values below. Only the API ROUTES and any DB recording are host-specific.
//
// Env it reads:
//   SOLANA_RPC                    explicit RPC URL (wins if set) e.g. a Helius URL
//   HELIUS_API_KEY | NEXT_PUBLIC_HELIUS_API_KEY   used to build a mainnet Helius URL
//   SOLANA_MINT_AUTHORITY_SECRET  the mint-authority keypair (base58 or JSON array)
//                                 required only for MINTING (create-tree / mint);
//                                 the transfer BUILDER needs no secret.

// Resolve the Solana RPC endpoint. Explicit SOLANA_RPC wins; otherwise build the
// mainnet Helius URL from the API key (matches the host app's existing convention).
export function getSolanaRpc(): string {
  const explicit = (process.env.SOLANA_RPC || '').trim()
  if (explicit) return explicit
  const key = (process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY || '').trim()
  if (!key) {
    throw new Error(
      'cNFT module: set SOLANA_RPC, or HELIUS_API_KEY / NEXT_PUBLIC_HELIUS_API_KEY'
    )
  }
  return `https://mainnet.helius-rpc.com/?api-key=${key}`
}
