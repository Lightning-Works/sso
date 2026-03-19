/**
 * Wallet Connection Module
 *
 * Modular wallet system supporting multiple chains:
 * - EVM (MetaMask, WalletConnect) via wagmi/viem
 * - Solana (Phantom, Solflare) via @solana/wallet-adapter
 * - WAX (Cloud Wallet) via @waxio/waxjs
 *
 * To add a new wallet type:
 * 1. Create a new file in src/lib/wallets/ (e.g., cosmos.ts)
 * 2. Export connection/format functions
 * 3. Add the chain type to types.ts
 * 4. Import and register in this index file
 * 5. Add UI component in the account page
 */

export * from './types'
export * from './evm'
export * from './solana'
export * from './wax'
