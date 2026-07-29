/**
 * USD price feed for WAX + TLM (Alien Worlds), used to value tool purchases
 * (priced in WAX) against extra Trilium earned. Public CoinGecko endpoint;
 * callers must handle failure (payback math is then omitted, not faked).
 */
export type UsdPrices = { wax: number; tlm: number }

export async function fetchUsdPrices(): Promise<UsdPrices> {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=wax,alien-worlds&vs_currencies=usd')
  if (!r.ok) throw new Error('prices unavailable')
  const d = await r.json()
  return { wax: Number(d?.wax?.usd) || 0, tlm: Number(d?.['alien-worlds']?.usd) || 0 }
}

/** The 6 planet tokens — valued at the TLM price (≈1:1 convertible with TLM). */
export const PLANET_TOKEN_SYMBOLS = new Set(['MAG', 'EYE', 'KAV', 'NAR', 'NER', 'VEL'])

/** USD value of an amount of a given symbol, or null if we can't price it. */
export function usdFor(symbol: string, amount: number, prices: UsdPrices | null): number | null {
  if (!prices) return null
  const sym = symbol.toUpperCase()
  if (sym === 'WAX') return amount * prices.wax
  if (sym === 'TLM') return amount * prices.tlm
  if (PLANET_TOKEN_SYMBOLS.has(sym)) return amount * prices.tlm
  return null
}

/** Format as "($12.34 USD)". */
export function fmtUsd(n: number): string {
  return `($${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`
}

/** Parse an asset string like "60000.0000 TLM" and return its USD value. */
export function usdFromAsset(str: string, prices: UsdPrices | null): number | null {
  const m = /([\d,.]+)\s+([A-Za-z]+)/.exec(str || '')
  if (!m) return null
  return usdFor(m[2], parseFloat(m[1].replace(/,/g, '')), prices)
}
