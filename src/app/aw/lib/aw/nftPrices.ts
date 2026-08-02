/**
 * Lowest active market price per template, from AtomicMarket — the same
 * "Lowest Price" AtomicHub shows on an asset page. Deduped by template and
 * concurrency-limited so an inventory of many NFTs doesn't hammer the API.
 * Returns a { templateId: priceInWax } map; missing templates = not listed.
 */
const AM = 'https://wax.api.atomicassets.io/atomicmarket/v1/sales'
const CONCURRENCY = 6

async function lowestForTemplate(tid: string): Promise<number | null> {
  try {
    const r = await fetch(`${AM}?state=1&template_id=${tid}&sort=price&order=asc&limit=1&symbol=WAX`)
    if (!r.ok) return null
    const d = await r.json()
    const p = d.data?.[0]?.price
    if (!p?.amount) return null
    return Number(p.amount) / Math.pow(10, Number(p.token_precision) || 8)
  } catch {
    return null
  }
}

export async function fetchFloorWax(templateIds: (string | null | undefined)[]): Promise<Record<string, number>> {
  const uniq = [...new Set(templateIds.filter((t): t is string => !!t))]
  const out: Record<string, number> = {}
  for (let i = 0; i < uniq.length; i += CONCURRENCY) {
    const batch = uniq.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async tid => {
      const w = await lowestForTemplate(tid)
      if (w != null) out[tid] = w
    }))
  }
  return out
}
