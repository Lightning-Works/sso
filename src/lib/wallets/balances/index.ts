/**
 * Balance Checker Index
 *
 * To add a new chain's balance checker:
 * 1. Create a new file (e.g., cosmos-balances.ts)
 * 2. Export a function that takes an address and returns WalletToken[]
 * 3. Import and register here in getAllBalances
 */

import type { WalletToken, WalletChain } from '../types'
import { getSolanaBalances } from './solana-balances'
import { getEvmBalances } from './evm-balances'
import { getWaxBalances } from './wax-balances'

export async function getBalancesForAddress(chain: WalletChain, address: string): Promise<WalletToken[]> {
  switch (chain) {
    case 'solana':
      return getSolanaBalances(address)
    case 'evm':
      return getEvmBalances(address)
    case 'wax':
      return getWaxBalances(address)
    default:
      return []
  }
}

export async function getAllBalances(wallets: { chain: WalletChain; address: string }[]): Promise<WalletToken[]> {
  const results = await Promise.allSettled(
    wallets.map(w => getBalancesForAddress(w.chain, w.address))
  )
  const allTokens: WalletToken[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTokens.push(...result.value)
    }
  }
  return allTokens
}

export { getSolanaBalances } from './solana-balances'
export { getEvmBalances } from './evm-balances'
export { getWaxBalances } from './wax-balances'
