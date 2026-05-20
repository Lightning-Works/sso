/**
 * GET /api/comics/tiers?contract=0x…
 *
 * Returns the tier inventory for a comic series, computed live from the
 * cached on-chain attributes (`lw_nft_data.attributes`). For each
 * distinct value of the `tier` or `rarity` trait we return the supply
 * count, ordered by count DESC — so the first entry is the most common
 * tier (lowest rank) and the last is the rarest (highest rank). The
 * Comic Reader uses this list both to populate the admin's "Set tier"
 * dropdown and to compute which extras a viewer is allowed to see,
 * without anyone having to hand-maintain a tier list per comic.
 *
 * No ownership/admin gating: tier supply counts are public information
 * already derivable from any block explorer. The response is cached for
 * 5 min — tier composition changes only when new mints happen.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { extractTier, type TierAttribute } from '@/lib/comics/tier'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const contract = (params.get('contract') || '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{4,}$/.test(contract)) {
    return NextResponse.json({ tiers: [] }, { status: 400 })
  }

  const db = svc()
  const { data: ct } = await db.from('lw_nft_contracts')
    .select('id').ilike('contract_address', contract).limit(1).maybeSingle()
  if (!ct) return NextResponse.json({ tiers: [] })

  // Pull every minted token's attributes for the contract. Using a large
  // page size + pagination would let this scale beyond 50k tokens; for
  // now a single 50k cap covers every LightningWorks comic comfortably.
  const { data: nfts } = await db.from('lw_nft_data')
    .select('attributes').eq('contract_id', ct.id).limit(50000)

  const counts = new Map<string, number>()
  for (const row of nfts || []) {
    const v = extractTier((row.attributes || []) as TierAttribute[])
    if (!v) continue
    counts.set(v, (counts.get(v) || 0) + 1)
  }

  // Order: most common first (= lowest rank). Ties resolved alphabetically
  // so the output is deterministic across requests.
  const tiers = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return NextResponse.json({ tiers }, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
