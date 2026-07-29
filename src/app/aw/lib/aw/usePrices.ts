'use client'

import { useEffect, useState } from 'react'
import { fetchUsdPrices, type UsdPrices } from './prices'

/** Session-cached WAX/TLM USD prices, fetched once and shared across the app. */
let cache: UsdPrices | null = null
let inflight: Promise<UsdPrices> | null = null

export function usePrices(): UsdPrices | null {
  const [p, setP] = useState<UsdPrices | null>(cache)
  useEffect(() => {
    if (cache) { setP(cache); return }
    if (!inflight) inflight = fetchUsdPrices().then(r => { cache = r; return r })
    inflight.then(setP).catch(() => { inflight = null })
  }, [])
  return p
}
