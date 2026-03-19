/**
 * EVM Balance Checker via Alchemy API
 * Returns native + USDT/USDC + other ERC-20 token balances
 * Currently supports Ethereum and Polygon only
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
}

// Always show these tokens even at 0 balance
const ALWAYS_SHOW_TOKENS: Record<string, { address: string; symbol: string; name: string; decimals: number }[]> = {
  ethereum: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  polygon: [
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
}

async function getTokenBalance(rpcUrl: string, tokenAddress: string, walletAddress: string): Promise<string> {
  try {
    // balanceOf(address) function selector
    const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: tokenAddress, data }, 'latest'],
      }),
    })
    const result = await res.json()
    if (result.result && result.result !== '0x') {
      return result.result
    }
  } catch { /* ignore */ }
  return '0x0'
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
        name: config.name,
        balance: balance.toFixed(4),
        decimals: 18,
        chain: 'evm',
        walletAddress: address,
      })
    }

    // Always check USDT and USDC
    const alwaysShow = ALWAYS_SHOW_TOKENS[chainName] || []
    for (const token of alwaysShow) {
      const rawBalance = await getTokenBalance(config.url, token.address, address)
      const balance = Number(BigInt(rawBalance)) / Math.pow(10, token.decimals)
      tokens.push({
        symbol: token.symbol,
        name: `${token.name} (${config.name})`,
        balance: balance.toFixed(2),
        decimals: token.decimals,
        address: token.address,
        chain: 'evm',
        walletAddress: address,
      })
    }

    // Get other ERC-20 tokens with non-zero balances via Alchemy
    try {
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
        const alwaysShowAddresses = new Set(alwaysShow.map(t => t.address.toLowerCase()))
        const nonZeroTokens = tokenData.result.tokenBalances.filter(
          (t: { tokenBalance: string; contractAddress: string }) =>
            t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000' &&
            !alwaysShowAddresses.has(t.contractAddress.toLowerCase())
        )

        for (const token of nonZeroTokens.slice(0, 15)) {
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
                  name: `${meta.result.name || 'Unknown'} (${config.name})`,
                  balance: balance.toFixed(4),
                  decimals,
                  address: token.contractAddress,
                  chain: 'evm',
                  walletAddress: address,
                })
              }
            }
          } catch { /* skip token */ }
        }
      }
    } catch { /* Alchemy token fetch failed, we still have native + stables */ }

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
