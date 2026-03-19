/**
 * Solana Wallet Module (Phantom, Solflare, etc.)
 * Uses @solana/wallet-adapter for connections
 */

import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import type { ConnectedWallet } from './types'
import { shortenAddress } from './types'

// Supported Solana wallets
export function getSolanaWallets() {
  return [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ]
}

// Solana RPC endpoint
export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'

export function formatSolanaWallet(address: string, provider: string): ConnectedWallet {
  return {
    chain: 'solana',
    provider,
    address,
    displayAddress: shortenAddress(address),
    chainName: 'Solana',
  }
}
