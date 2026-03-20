/**
 * WAX Cloud Wallet Module
 * Uses @waxio/waxjs for Cloud Wallet connections
 */

import type { ConnectedWallet } from './types'

// WAX RPC endpoint
export const WAX_RPC = 'https://wax.greymass.com'

export async function connectWaxWallet(): Promise<ConnectedWallet | null> {
  try {
    // Dynamic import to avoid SSR issues
    const { WaxJS } = await import('@waxio/waxjs/dist')
    const wax = new WaxJS({ rpcEndpoint: WAX_RPC })

    const userAccount = await wax.login()

    if (userAccount) {
      return formatWaxWallet(userAccount)
    }
    return null
  } catch (error) {
    console.error('WAX connection error:', error)
    return null
  }
}

export function formatWaxWallet(account: string): ConnectedWallet {
  return {
    chain: 'wax',
    provider: 'wax',
    address: account,
    displayAddress: account,
    chainName: 'WAX',
  }
}
