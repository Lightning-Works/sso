/**
 * EVM Wallet Module (MetaMask, WalletConnect, etc.)
 * Uses wagmi + viem for wallet connections
 */

import { http, createConfig } from 'wagmi'
import { mainnet, polygon, base, bsc } from 'wagmi/chains'
import { metaMask } from 'wagmi/connectors'
import type { ConnectedWallet } from './types'
import { shortenAddress } from './types'

// Wagmi config — Ethereum, Polygon, Base, BSC
export const evmConfig = createConfig({
  chains: [mainnet, polygon, base, bsc],
  connectors: [
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [bsc.id]: http(),
  },
})

// Chain name lookup
const chainNames: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  8453: 'Base',
  56: 'BSC',
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
