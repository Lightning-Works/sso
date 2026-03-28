/**
 * Token price fetcher using free APIs only.
 * CoinGecko for major tokens, DexScreener for Solana/DEX tokens.
 */

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  POL: 'matic-network',
  SOL: 'solana',
  BNB: 'binancecoin',
  WAX: 'wax',
  TLM: 'alien-worlds',
  USDT: 'tether',
  USDC: 'usd-coin',
  DIVI: 'divi',
  AVAX: 'avalanche-2',
  CORE: 'coredaoorg',
  ARB: 'arbitrum',
  OP: 'optimism',
}

const LOGO_CDN = 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images'

let priceCache: Record<string, number> = {}
let lastFetch = 0

// ── CoinGecko (batch, free, 30 calls/min) ──

export async function fetchCoinGeckoPrices(): Promise<Record<string, number>> {
  // Rate limit: only fetch once per 60s
  if (Date.now() - lastFetch < 60000 && Object.keys(priceCache).length > 0) {
    return { ...priceCache }
  }

  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json()
    const prices: Record<string, number> = {}
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd) prices[symbol] = data[geckoId].usd
    }
    prices.USDT = prices.USDT || 1
    prices.USDC = prices.USDC || 1
    priceCache = prices
    lastFetch = Date.now()
    return prices
  } catch {
    return { USDT: 1, USDC: 1, ...priceCache }
  }
}

// ── DexScreener (batch by 30, free, no auth) ──

export async function fetchDexScreenerPrices(
  mintAddresses: string[],
  chain: 'solana' | 'ethereum' | 'polygon' | 'base' | 'bsc' = 'solana',
): Promise<{ prices: Record<string, number>; logos: Record<string, string> }> {
  if (mintAddresses.length === 0) return { prices: {}, logos: {} }

  const prices: Record<string, number> = {}
  const logos: Record<string, string> = {}
  const BATCH = 30

  for (let i = 0; i < mintAddresses.length; i += BATCH) {
    const batch = mintAddresses.slice(i, i + BATCH)
    try {
      const res = await fetch(
        `https://api.dexscreener.com/tokens/v1/${chain}/${batch.join(',')}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data)) continue

      const seen = new Set<string>()
      for (const pair of data) {
        const addr = pair.baseToken?.address
        if (!addr || seen.has(addr)) continue
        seen.add(addr)
        if (pair.priceUsd) {
          const price = parseFloat(pair.priceUsd)
          if (!isNaN(price)) prices[addr] = price
        }
        if (pair.info?.imageUrl) logos[addr] = pair.info.imageUrl
      }
    } catch { /* skip batch */ }
  }

  return { prices, logos }
}

// ── Logo URL helper ──

export function getTokenLogoUrl(symbol: string): string | null {
  const geckoId = COINGECKO_IDS[symbol]
  if (!geckoId) return null
  return `${LOGO_CDN}/${geckoId}/small.png`
}

// ── Format USD ──

export function formatUsd(amount: number): string {
  if (amount < 0.01) return '$0.00'
  if (amount < 1000) return `$${amount.toFixed(2)}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
