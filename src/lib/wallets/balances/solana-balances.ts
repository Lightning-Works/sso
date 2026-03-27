/**
 * Solana Balance Checker via Helius API
 * Returns SOL + all SPL token balances for an address
 */

import type { WalletToken } from '../types'

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY

export async function getSolanaBalances(address: string): Promise<WalletToken[]> {
  const tokens: WalletToken[] = []

  try {
    // Get SOL balance
    const solRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    })
    const solData = await solRes.json()
    if (solData.result?.value !== undefined) {
      const lamports = solData.result.value
      tokens.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: (lamports / 1e9).toFixed(4),
        decimals: 9,
        chain: 'solana',
        walletAddress: address,
      })
    }

    // Get all token balances via Helius DAS API
    const tokenRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          address,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      }),
    })
    const tokenData = await tokenRes.json()

    if (tokenData.result?.value) {
      for (const account of tokenData.result.value) {
        const info = account.account.data.parsed.info
        const amount = info.tokenAmount
        if (parseFloat(amount.uiAmountString) > 0) {
          tokens.push({
            symbol: info.mint.slice(0, 6) + '...',
            name: info.mint,
            balance: amount.uiAmountString,
            decimals: amount.decimals,
            address: info.mint,
            chain: 'solana',
            walletAddress: address,
          })
        }
      }
    }

    // Try to get token metadata from Helius for better names
    const mints = tokens.filter(t => t.address).map(t => t.address!)
    if (mints.length > 0) {
      try {
        const metaRes = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mintAccounts: mints, includeOffChain: true }),
        })
        const metaData = await metaRes.json()
        if (Array.isArray(metaData)) {
          for (const meta of metaData) {
            const token = tokens.find(t => t.address === meta.account)
            if (token && meta.onChainMetadata?.metadata?.data) {
              token.name = meta.onChainMetadata.metadata.data.name.replace(/\0/g, '').trim()
              token.symbol = meta.onChainMetadata.metadata.data.symbol.replace(/\0/g, '').trim()
            }
            if (token) {
              const offChainImg = meta.offChainMetadata?.metadata?.image
              if (offChainImg) token.logoUrl = offChainImg
            }
          }
        }
      } catch {
        // Metadata fetch failed, keep short addresses as names
      }
    }
  } catch (e) {
    console.error('Solana balance error:', e)
  }

  return tokens
}
