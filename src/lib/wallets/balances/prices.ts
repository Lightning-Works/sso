/**
 * Token Price Fetcher
 * Uses CoinGecko for major tokens + Jupiter for Solana tokens
 * Falls back to DexScreener for anything not found
 */

export const COINGECKO_IDS: Record<string, string> = {
  'ETH': 'ethereum',
  'POL': 'matic-network',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'WAX': 'wax',
  'TLM': 'alien-worlds',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'DIVI': 'divi',
}

let priceCache: Record<string, number> = {}
let mintPriceCache: Record<string, number> = {}
let lastFetch = 0

// Fetch major token prices from CoinGecko
async function fetchCoinGeckoPrices(): Promise<Record<string, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    )
    const data = await res.json()
    const prices: Record<string, number> = {}
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd) {
        prices[symbol] = data[geckoId].usd
      }
    }
    prices['USDT'] = prices['USDT'] || 1
    prices['USDC'] = prices['USDC'] || 1
    return prices
  } catch {
    return { USDT: 1, USDC: 1 }
  }
}

// Fetch Solana token prices from Jupiter Price API (free, all tokens)
async function fetchJupiterPrices(mintAddresses: string[]): Promise<Record<string, number>> {
  if (mintAddresses.length === 0) return {}
  try {
    const ids = mintAddresses.join(',')
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`)
    const data = await res.json()
    const prices: Record<string, number> = {}
    if (data.data) {
      for (const [mint, info] of Object.entries(data.data)) {
        const priceInfo = info as { price?: string }
        if (priceInfo.price) {
          prices[mint] = parseFloat(priceInfo.price)
        }
      }
    }
    return prices
  } catch {
    return {}
  }
}

// Fetch price for any token by contract address from DexScreener (free)
async function fetchDexScreenerPrice(address: string, chain: string): Promise<number | null> {
  try {
    const chainMap: Record<string, string> = {
      'evm': 'ethereum',
      'solana': 'solana',
    }
    const dexChain = chainMap[chain] || chain
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
    const data = await res.json()
    if (data.pairs && data.pairs.length > 0) {
      // Use the pair with highest liquidity
      const sorted = data.pairs.sort((a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )
      const price = parseFloat(sorted[0].priceUsd)
      if (!isNaN(price)) return price
    }
  } catch { /* ignore */ }
  return null
}

export async function getTokenPrices(): Promise<Record<string, number>> {
  if (Date.now() - lastFetch < 60000 && Object.keys(priceCache).length > 0) {
    return priceCache
  }

  const prices = await fetchCoinGeckoPrices()
  priceCache = prices
  lastFetch = Date.now()
  return prices
}

// Get price for a specific Solana token by mint address
export async function getSolanaTokenPrice(mintAddress: string): Promise<number | null> {
  if (mintPriceCache[mintAddress] !== undefined) {
    return mintPriceCache[mintAddress]
  }

  const jupPrices = await fetchJupiterPrices([mintAddress])
  if (jupPrices[mintAddress]) {
    mintPriceCache[mintAddress] = jupPrices[mintAddress]
    return jupPrices[mintAddress]
  }

  // Fallback to DexScreener
  const dsPrice = await fetchDexScreenerPrice(mintAddress, 'solana')
  if (dsPrice) {
    mintPriceCache[mintAddress] = dsPrice
    return dsPrice
  }

  return null
}

// Get price for any token — checks symbol first, then mint/contract address
export async function getTokenPrice(symbol: string, mintAddress?: string, chain?: string): Promise<number | null> {
  // Check cached symbol prices first
  const cached = priceCache[symbol]
  if (cached) return cached

  // For Solana tokens with mint addresses, try Jupiter
  if (mintAddress && (chain === 'solana' || !chain)) {
    const jupPrice = await getSolanaTokenPrice(mintAddress)
    if (jupPrice) return jupPrice
  }

  // For EVM tokens with contract addresses, try DexScreener
  if (mintAddress && chain === 'evm') {
    const dsPrice = await fetchDexScreenerPrice(mintAddress, 'evm')
    if (dsPrice) return dsPrice
  }

  return null
}

// Batch fetch Jupiter prices for Solana tokens and merge into a symbol-keyed map
export async function getSolanaPricesByMint(tokens: { symbol: string; address?: string }[]): Promise<Record<string, number>> {
  const mints = tokens.filter(t => t.address).map(t => t.address!)
  if (mints.length === 0) return {}

  const jupPrices = await fetchJupiterPrices(mints)

  // Map mint prices back to symbols
  const result: Record<string, number> = {}
  for (const t of tokens) {
    if (t.address && jupPrices[t.address]) {
      result[t.symbol] = jupPrices[t.address]
      mintPriceCache[t.address] = jupPrices[t.address]
    }
  }
  return result
}

const LOGO_CDN = 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images'

export function getTokenLogoUrl(symbol: string): string | null {
  const geckoId = COINGECKO_IDS[symbol]
  if (!geckoId) return null
  return `${LOGO_CDN}/${geckoId}/small.png`
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return '$0.00'
  if (amount < 1) return `$${amount.toFixed(2)}`
  if (amount < 1000) return `$${amount.toFixed(2)}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
