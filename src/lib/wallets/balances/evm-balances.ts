/**
 * EVM Balance Checker via Alchemy API
 * Returns native + all ERC-20 token balances across multiple chains
 */

import type { WalletToken } from '../types'

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY

const CHAINS: Record<string, { url: string; symbol: string; name: string }> = {
  ethereum: {
    url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    symbol: 'ETH',
    name: 'Ethereum',
  },
  polygon: {
    url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    symbol: 'POL',
    name: 'Polygon',
  },
  arbitrum: {
    url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    symbol: 'ETH',
    name: 'Arbitrum',
  },
}

async function getChainBalances(chainName: string, config: typeof CHAINS[string], address: string): Promise<WalletToken[]> {
  const tokens: WalletToken[] = []

  try {
    // Get native balance
    const nativeRes = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    })
    const nativeData = await nativeRes.json()
    if (nativeData.result) {
      const wei = BigInt(nativeData.result)
      const balance = Number(wei) / 1e18
      tokens.push({
        symbol: config.symbol,
        name: `${config.name}`,
        balance: balance.toFixed(4),
        decimals: 18,
        chain: 'evm',
        walletAddress: address,
      })
    }

    // Get all ERC-20 token balances via Alchemy
    const tokenRes = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'alchemy_getTokenBalances',
        params: [address],
      }),
    })
    const tokenData = await tokenRes.json()

    if (tokenData.result?.tokenBalances) {
      const nonZeroTokens = tokenData.result.tokenBalances.filter(
        (t: { tokenBalance: string }) => t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000'
      )

      // Get metadata for non-zero tokens (batch)
      for (const token of nonZeroTokens.slice(0, 20)) { // Limit to 20 tokens
        try {
          const metaRes = await fetch(config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              method: 'alchemy_getTokenMetadata',
              params: [token.contractAddress],
            }),
          })
          const meta = await metaRes.json()

          if (meta.result) {
            const rawBalance = BigInt(token.tokenBalance)
            const decimals = meta.result.decimals || 18
            const balance = Number(rawBalance) / Math.pow(10, decimals)

            if (balance > 0.0001) {
              tokens.push({
                symbol: meta.result.symbol || '???',
                name: `${meta.result.name || 'Unknown'} (${chainName})`,
                balance: balance.toFixed(4),
                decimals,
                address: token.contractAddress,
                chain: 'evm',
                walletAddress: address,
              })
            }
          }
        } catch {
          // Skip token if metadata fails
        }
      }
    }
  } catch (e) {
    console.error(`${chainName} balance error:`, e)
  }

  return tokens
}

export async function getEvmBalances(address: string): Promise<WalletToken[]> {
  if (!ALCHEMY_KEY) {
    console.error('Alchemy API key not set')
    return []
  }

  const results = await Promise.allSettled(
    Object.entries(CHAINS).map(([name, config]) => getChainBalances(name, config, address))
  )

  const allTokens: WalletToken[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTokens.push(...result.value)
    }
  }

  return allTokens
}
