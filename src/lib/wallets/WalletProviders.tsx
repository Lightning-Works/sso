'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { evmConfig } from './evm'
import { getSolanaWallets, SOLANA_RPC } from './solana'
import { useMemo } from 'react'

const queryClient = new QueryClient()

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const solanaWallets = useMemo(() => getSolanaWallets(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={evmConfig}>
        <ConnectionProvider endpoint={SOLANA_RPC}>
          <WalletProvider wallets={solanaWallets} autoConnect={false}>
            {children}
          </WalletProvider>
        </ConnectionProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
