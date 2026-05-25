/**
 * POST /api/divigo/link   — link the signed-in user to a DiviGo account.
 *
 * Body: { number, route }
 *   number — phone with country code (without +) for wa/whatsapp, or
 *            numeric Telegram user ID for telegram routes.
 *   route  — 'telegram' | 'wa' | 'whatsapp' | 'telegramLaunchGoat' | 'meta' | 'signal'
 *
 * We do NOT verify the account exists here, because DiviGo's balance lookup
 * cannot distinguish "no account" from "account with zero balance everywhere"
 * and gameuser is for in-game-username lookups only. Verification is implicit:
 * the first send triggers a Telegram approval — only the real owner can
 * approve. If they linked someone else's account they cannot spend.
 *
 * Uniqueness is enforced both ways:
 *   - user_id is the PK (one DiviGo account per SSO user)
 *   - (number, route) is unique (one SSO user per DiviGo account)
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const VALID_ROUTES = new Set(['telegram', 'telegramLaunchGoat', 'wa', 'whatsapp', 'meta', 'signal'])

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  // Strip the optional '+' (DiviGo does too) and any spaces / dashes the user typed.
  const number = String(body.number || '').replace(/[+\s-]/g, '').trim()
  const route = String(body.route || '').trim()

  if (number.length < 5) return NextResponse.json({ error: 'Number must be at least 5 digits' }, { status: 400 })
  if (!VALID_ROUTES.has(route)) return NextResponse.json({ error: 'Unknown route' }, { status: 400 })
  // For telegram routes DiviGo expects a numeric user ID; for others it's a phone.
  if ((route === 'telegram' || route === 'telegramLaunchGoat') && !/^\d+$/.test(number)) {
    return NextResponse.json({ error: 'Telegram routes require a numeric Telegram user ID' }, { status: 400 })
  }
  if ((route === 'wa' || route === 'whatsapp') && !/^\d{5,15}$/.test(number)) {
    return NextResponse.json({ error: 'WhatsApp routes require a phone number with country code' }, { status: 400 })
  }

  const { error } = await svc().from('divigo_links').upsert({
    user_id: user.id,
    divigo_number: number,
    divigo_route: route,
    linked_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) {
    // 23505 = unique_violation on (number, route): someone else already linked this DiviGo account.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That DiviGo account is already linked to another SSO user' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, link: { divigo_number: number, divigo_route: route } })
}
