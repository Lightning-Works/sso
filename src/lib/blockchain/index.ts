/**
 * Blockchain module — free RPC infrastructure for all chains.
 *
 * Usage:
 *   import { getEvmTokens, getSolanaTokens, getWaxTokens } from '@/lib/blockchain'
 *   import { getEvmNfts, getSolanaNfts, getWaxNfts } from '@/lib/blockchain'
 *   import { fetchCoinGeckoPrices, fetchDexScreenerPrices } from '@/lib/blockchain'
 *   import { getCachedBalances, getCachedNfts } from '@/lib/blockchain'
 */

// RPC providers
export { EVM_CHAINS, SOLANA_RPC, WAX_RPC, SKALE_CHAINS, rpcCall, blockscoutFetch } from './rpc'

// Token balance fetchers
export { getEvmTokens, getSolanaTokens, getWaxTokens } from './tokens'
export type { TokenBalance } from './tokens'

// NFT fetchers
export { getEvmNfts, getSolanaNfts, getWaxNfts } from './nfts'
export type { BlockchainNft } from './nfts'

// Price fetchers
export { fetchCoinGeckoPrices, fetchDexScreenerPrices, getTokenLogoUrl, formatUsd } from './prices'

// Cache layer
export { getCachedBalances, getCachedNfts, upsertBalances, upsertNfts } from './cache'
export type { CachedBalance, CachedNft } from './cache'
