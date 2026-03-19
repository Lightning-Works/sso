/**
 * EVM Wallet Module (MetaMask, WalletConnect, etc.)
 * Uses wagmi + viem for wallet connections
 */

import { http, createConfig } from 'wagmi'
import { mainnet, polygon, bsc, arbitrum } from 'wagmi/chains'
import { metaMask } from 'wagmi/connectors'
import type { ConnectedWallet } from './types'
import { shortenAddress } from './types'

// Wagmi config - add more chains as needed
export const evmConfig = createConfig({
  chains: [mainnet, polygon, bsc, arbitrum],
  connectors: [
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
    [arbitrum.id]: http(),
  },
})

// Chain name lookup
const chainNames: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  56: 'BSC',
  42161: 'Arbitrum',
}

export function getChainName(chainId: number): string {
  return chainNames[chainId] || `Chain ${chainId}`
}

export function formatEvmWallet(address: string, chainId: number): ConnectedWallet {
  return {
    chain: 'evm',
    provider: 'metamask',
    address,
    displayAddress: shortenAddress(address),
    chainId,
    chainName: getChainName(chainId),
  }
}
