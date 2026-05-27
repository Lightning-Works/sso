/**
 * GET /api/oauth/divigo/balance
 *
 * App-mediated balance lookup. Requires `balance:read` scope on the grant.
 * Wraps the same multi-coin fan-out our internal /api/divigo/balance does
 * (one 'all' call + parallel single-coin calls for the extras), so apps
 * get the full picture for every coin DiviGo supports.
 *
 * Rate limit: 60 reads per (user, app) per hour. Audit-logged.
 *
 * Response: { balances: { divi: 100, btc: 0.05, ... } }   (non-zero only)
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { withAppAndUser, audit, rateLimit, OAuthError } from '@/lib/oauth/divigo'
import { balance as diviGoBalance, diviGoConfigured, DiviGoNotConfiguredError, type MsgRoute } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

const EXTRA_COINS = ['wax', 'tlm', 'fio', 'bnb', 'dash'] as const

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  try {
    const ctx = await withAppAndUser(request, 'balance:read')
    await rateLimit(ctx.user.id, ctx.app.id, 'balance.read', 60)
    if (!diviGoConfigured()) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }

    const db = svc()
    const { data: link } = await db.from('divigo_links')
      .select('divigo_number, divigo_route, verified_at').eq('user_id', ctx.user.id).maybeSingle()
    if (!link || !link.verified_at || !link.divigo_number || !link.divigo_route) {
      return NextResponse.json({ error: 'not_linked' }, { status: 404 })
    }

    const number = link.divigo_number
    const route = link.divigo_route as MsgRoute

    try {
      const allResult = await diviGoBalance({ number, route, coin: 'all' })
      const balances: Record<string, number> = {}
      if (allResult && typeof allResult === 'object') {
        for (const [coin, amt] of Object.entries(allResult as Record<string, unknown>)) {
          const n = typeof amt === 'number' ? amt : Number(amt)
          if (Number.isFinite(n) && n > 0) balances[coin.toLowerCase()] = n
        }
      }
      const extras = await Promise.all(EXTRA_COINS.map(async coin => {
        try {
          const r = await diviGoBalance({ number, route, coin })
          const n = typeof r === 'number' ? r : Number(r)
          return Number.isFinite(n) && n > 0 ? [coin, n] as const : null
        } catch { return null }
      }))
      for (const e of extras) if (e) balances[e[0]] = e[1]

      await audit(ctx.user.id, ctx.app.id, 'balance.read', { coins: Object.keys(balances) })
      return NextResponse.json({ balances })
    } catch (e) {
      if (e instanceof DiviGoNotConfiguredError) {
        return NextResponse.json({ error: 'not_configured' }, { status: 503 })
      }
      return NextResponse.json({
        error: e instanceof Error ? e.message : 'balance_failed',
      }, { status: 502 })
    }
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'internal', message: String(e) }, { status: 500 })
  }
}
