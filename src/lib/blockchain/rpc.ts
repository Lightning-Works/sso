/**
 * Free RPC provider with fallbacks for all supported chains.
 * No paid APIs required.
 */

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY || ''
const TIMEOUT = 8000

// ── Chain RPC configs ──

export interface ChainRpc {
  name: string
  rpcs: string[]          // primary + fallbacks
  nativeName: string
  nativeSymbol: string
  nativeDecimals: number
  blockscoutApi?: string  // for NFTs and token lists
}

export const EVM_CHAINS: Record<string, ChainRpc> = {
  ethereum: {
    name: 'Ethereum',
    rpcs: ['https://cloudflare-eth.com', 'https://rpc.ankr.com/eth', 'https://eth.drpc.org'],
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutApi: 'https://eth.blockscout.com/api/v2',
  },
  polygon: {
    name: 'Polygon',
    rpcs: ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon', 'https://polygon.drpc.org'],
    nativeName: 'Polygon',
    nativeSymbol: 'POL',
    nativeDecimals: 18,
    blockscoutApi: 'https://polygon.blockscout.com/api/v2',
  },
  base: {
    name: 'Base',
    rpcs: ['https://mainnet.base.org', 'https://rpc.ankr.com/base', 'https://base.drpc.org'],
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutApi: 'https://base.blockscout.com/api/v2',
  },
  bsc: {
    name: 'BSC',
    rpcs: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io', 'https://rpc.ankr.com/bsc'],
    nativeName: 'BNB',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    blockscoutApi: 'https://bsc.blockscout.com/api/v2',
  },
  arbitrum: {
    name: 'Arbitrum',
    rpcs: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutApi: 'https://arbitrum.blockscout.com/api/v2',
  },
  optimism: {
    name: 'Optimism',
    rpcs: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
    nativeName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    blockscoutApi: 'https://optimism.blockscout.com/api/v2',
  },
  avalanche: {
    name: 'Avalanche',
    rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
    nativeName: 'Avalanche',
    nativeSymbol: 'AVAX',
    nativeDecimals: 18,
  },
  core: {
    name: 'Core',
    rpcs: ['https://rpc.coredao.org', 'https://rpc-core.icecreamswap.com'],
    nativeName: 'Core',
    nativeSymbol: 'CORE',
    nativeDecimals: 18,
    blockscoutApi: 'https://scan.coredao.org/api/v2',
  },
  waterfall: {
    name: 'Waterfall',
    rpcs: ['https://rpc.waterfall.network/', 'https://rpc0.waterfall.network/', 'https://rpc1.waterfall.network/'],
    nativeName: 'Water',
    nativeSymbol: 'WATER',
    nativeDecimals: 18,
  },
}

export const SOLANA_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
export const HELIUS_METADATA_URL = `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_KEY}`
export const WAX_RPC = 'https://wax.greymass.com'
export const ATOMIC_API = 'https://wax.api.atomicassets.io'

export const SKALE_CHAINS: Record<string, { name: string; blockscoutApi: string; rpc: string }> = {
  nebula: {
    name: 'SKALE Nebula',
    blockscoutApi: 'https://green-giddy-denebola.explorer.mainnet.skalenodes.com/api/v2',
    rpc: 'https://mainnet.skalenodes.com/v1/green-giddy-denebola',
  },
}

// ── RPC call with fallback ──

export async function rpcCall(
  rpcs: string[],
  method: string,
  params: unknown[],
): Promise<Record<string, unknown> | null> {
  for (const rpc of rpcs) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue
      return data
    } catch {
      continue
    }
  }
  return null
}

// ── Blockscout fetch with timeout ──

export async function blockscoutFetch(url: string, timeout = TIMEOUT): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
