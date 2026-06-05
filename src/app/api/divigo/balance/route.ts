/**
 * GET /api/divigo/balance   — read the signed-in user's DiviGo balances.
 *
 * Looks up the user's stored (number, route) from divigo_links and queries
 * DiviGo's `balance` method for every supported coin.
 *
 * Why we don't just use coin='all':
 *   DiviGo's `balance` with coin='all' only iterates a fixed list:
 *   ['divi', 'btc', 'eth', 'ltc', 'doge', 'core'] (see DiviGoReboot
 *   src/controllers/api.js). Anything else — WAX, TLM, FIO, BNB, DASH —
 *   has to be requested individually. We do both: one 'all' call for the
 *   standard list, then parallel single-coin calls for the rest. Merge
 *   into one map of non-zero entries and cache on divigo_links.last_balance
 *   so the UI can render instantly on next load.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { balance as diviGoBalance, diviGoConfigured, type MsgRoute, DiviGoNotConfiguredError } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

// Coins to query individually after the 'all' call.
// (which only covers divi/btc/eth/ltc/doge/core). `poly` + the ERC-20 tokens
// (usdc/usdt/edivi) + `water` (Waterfall) read balance fine even though some
// can't be sent yet. `fio` dropped per request.
const EXTRA_COINS = ['poly', 'usdc', 'usdt', 'edivi', 'water', 'wax', 'tlm', 'bnb', 'dash'] as const

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!diviGoConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const db = svc()
  const { data: link } = await db.from('divigo_links')
    .select('divigo_number, divigo_route, verified_at').eq('user_id', user.id).maybeSingle()
  if (!link || !link.verified_at || !link.divigo_number || !link.divigo_route) {
    return NextResponse.json({ error: 'not_linked' }, { status: 404 })
  }

  const number = link.divigo_number
  const route = link.divigo_route as MsgRoute

  try {
    // 1) The 'all' call gets divi/btc/eth/ltc/doge/core (DiviGo iterates these).
    const allResult = await diviGoBalance({ number, route, coin: 'all' })
    const balances: Record<string, number> = {}
    if (allResult && typeof allResult === 'object') {
      for (const [coin, amt] of Object.entries(allResult as Record<string, unknown>)) {
        const n = typeof amt === 'number' ? amt : Number(amt)
        if (Number.isFinite(n) && n > 0) balances[coin.toLowerCase()] = n
      }
    }

    // 2) Parallel individual calls for the coins 'all' doesn't cover.
    //    Each one returns a number, null, or false depending on whether
    //    DiviGo has a wallet for that coin. Silently skip the rest.
    const extras = await Promise.all(EXTRA_COINS.map(async coin => {
      try {
        const r = await diviGoBalance({ number, route, coin })
        const n = typeof r === 'number' ? r : Number(r)
        return Number.isFinite(n) && n > 0 ? [coin, n] as const : null
      } catch { return null }
    }))
    for (const e of extras) if (e) balances[e[0]] = e[1]

    await db.from('divigo_links').update({
      last_verified_at: new Date().toISOString(),
      last_balance: balances,
    }).eq('user_id', user.id)
    return NextResponse.json({ balances })
  } catch (e) {
    if (e instanceof DiviGoNotConfiguredError) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }
    // Surface the actual upstream message so the UI can show something
    // diagnostic instead of the browser's generic "Failed to fetch".
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'balance failed',
      detail: String(e),
    }, { status: 502 })
  }
}
