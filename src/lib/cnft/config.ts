/**
 * Self-contained config for the shared cNFT module. No host-app imports.
 *
 * Env it reads:
 *   SOLANA_RPC                    explicit DAS-capable RPC URL (wins if set)
 *   HELIUS_API_KEY | NEXT_PUBLIC_HELIUS_API_KEY   used to build a Helius URL if no SOLANA_RPC
 *   SOLANA_NETWORK                'mainnet' | 'devnet' (default devnet; gates the local signer)
 *   MINTING_SIGNER               'local' | 'treasury' (default treasury)
 *   MINTING_DEV_KEYPAIR_FILE     path to a 64-byte keypair JSON (local signer, devnet only)
 *   TREASURY_SIGNER_URL          base URL of the isolated signer service (treasury mode)
 *   TREASURY_INTERNAL_TOKEN      bearer token for the signer service (treasury mode)
 *   MINTING_ROYALTY_WALLET       default royalty recipient (optional)
 *   MINTING_SELLER_FEE_BPS       default seller fee basis points (optional, default 500)
 */

export type SolanaNetwork = 'mainnet' | 'devnet'
export type SignerMode = 'local' | 'treasury'

export function solanaNetwork(): SolanaNetwork {
  return (process.env.SOLANA_NETWORK || 'devnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'devnet'
}

export function getSolanaRpc(): string {
  const explicit = (process.env.SOLANA_RPC || '').trim()
  if (explicit) return explicit
  const key = (process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY || '').trim()
  if (!key) {
    throw new Error('cNFT module: set SOLANA_RPC, or HELIUS_API_KEY / NEXT_PUBLIC_HELIUS_API_KEY')
  }
  const host = solanaNetwork() === 'mainnet' ? 'mainnet.helius-rpc.com' : 'devnet.helius-rpc.com'
  return `https://${host}/?api-key=${key}`
}

export function signerMode(): SignerMode {
  return (process.env.MINTING_SIGNER || 'treasury').toLowerCase() === 'local' ? 'local' : 'treasury'
}

export function devKeypairFile(): string {
  return (process.env.MINTING_DEV_KEYPAIR_FILE || '').trim()
}

export function treasuryUrl(): string {
  return (process.env.TREASURY_SIGNER_URL || 'http://127.0.0.1:8090').trim()
}

export function treasuryToken(): string {
  return (process.env.TREASURY_INTERNAL_TOKEN || '').trim()
}

export function defaultRoyaltyWallet(): string | undefined {
  const w = (process.env.MINTING_ROYALTY_WALLET || '').trim()
  return w || undefined
}

export function defaultSellerFeeBps(): number {
  const n = Number(process.env.MINTING_SELLER_FEE_BPS || '500')
  return Number.isFinite(n) ? n : 500
}
