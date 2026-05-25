/**
 * GET /api/divigo/balance   — read the signed-in user's DiviGo balance(s).
 *
 * Looks up the user's stored (number, route) from divigo_links and calls
 * DiviGo's `balance` method with coin='all'. Returns a non-zero map like
 * { divi: 100.5, btc: 0.05 }. An empty {} means "either no account or all
 * balances are zero" — we cannot distinguish (DiviGo doesn't tell us).
 *
 * Also caches the result on divigo_links.last_balance so the UI can render
 * something instantly on next load without waiting for the network call.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { balance as diviGoBalance, diviGoConfigured, type MsgRoute, DiviGoNotConfiguredError } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

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
  // Pending rows have null number/route — treat as not_linked so the UI
  // keeps the link-flow UX instead of trying to fetch balance for nothing.
  if (!link || !link.verified_at || !link.divigo_number || !link.divigo_route) {
    return NextResponse.json({ error: 'not_linked' }, { status: 404 })
  }

  try {
    const result = await diviGoBalance({
      number: link.divigo_number,
      route: link.divigo_route as MsgRoute,
      coin: 'all',
    })
    const balances = (result && typeof result === 'object') ? result as Record<string, number> : {}
    await db.from('divigo_links').update({
      last_verified_at: new Date().toISOString(),
      last_balance: balances,
    }).eq('user_id', user.id)
    return NextResponse.json({ balances })
  } catch (e) {
    if (e instanceof DiviGoNotConfiguredError) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'balance failed' }, { status: 502 })
  }
}
