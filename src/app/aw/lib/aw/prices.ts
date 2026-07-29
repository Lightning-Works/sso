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
