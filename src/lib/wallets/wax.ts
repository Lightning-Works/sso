/**
 * WAX Cloud Wallet Module
 * Uses @waxio/waxjs for Cloud Wallet connections
 */

import type { ConnectedWallet } from './types'
import { shortenAddress } from './types'

// WAX RPC endpoint
export const WAX_RPC = 'https://wax.greymass.com'

export async function connectWaxWallet(): Promise<ConnectedWallet | null> {
  try {
    // Dynamic import to avoid SSR issues
    const waxModule = await import('@waxio/waxjs/dist')
    const WaxJS = waxModule.default || waxModule
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wax = new (WaxJS as any)({ rpcEndpoint: WAX_RPC })

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
    displayAddress: account, // WAX accounts are short readable names
    chainName: 'WAX',
  }
}
