/**
 * Token Price Fetcher
 * Uses CoinGecko free API for USD prices
 */

const COINGECKO_IDS: Record<string, string> = {
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
let lastFetch = 0

export async function getTokenPrices(): Promise<Record<string, number>> {
  // Cache prices for 60 seconds
  if (Date.now() - lastFetch < 60000 && Object.keys(priceCache).length > 0) {
    return priceCache
  }

  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    )
    const data = await res.json()

    const prices: Record<string, number> = {}
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd) {
        prices[symbol] = data[geckoId].usd
      }
    }

    // Stablecoins should always be ~1
    prices['USDT'] = prices['USDT'] || 1
    prices['USDC'] = prices['USDC'] || 1

    priceCache = prices
    lastFetch = Date.now()
    return prices
  } catch (e) {
    console.error('Price fetch error:', e)
    // Return stablecoin defaults at minimum
    return { USDT: 1, USDC: 1, ...priceCache }
  }
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return '$0.00'
  if (amount < 1) return `$${amount.toFixed(2)}`
  if (amount < 1000) return `$${amount.toFixed(2)}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
