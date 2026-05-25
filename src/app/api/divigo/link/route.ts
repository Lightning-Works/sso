/**
 * POST /api/divigo/link   — link the signed-in user to a DiviGo account.
 *
 * Body: { number, route }
 *   number — any of these (DiviGo accepts all three forms):
 *              - DiviGo username (with or without leading @)
 *              - phone with country code (no +)
 *              - numeric Telegram user ID (only useful for telegram routes)
 *            DiviGo's apiBalance picks the right column based on whether
 *            the input is all-numeric (number) or contains letters (username).
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
  // Normalise: strip leading @, the optional '+' (DiviGo does too), and any
  // spaces / dashes the user typed. Lowercased so the (number, route) unique
  // constraint matches DiviGo's case-insensitive username lookup.
  const number = String(body.number || '').replace(/^@/, '').replace(/[+\s-]/g, '').trim().toLowerCase()
  const route = String(body.route || '').trim()

  if (number.length < 4) return NextResponse.json({ error: 'Identifier is too short' }, { status: 400 })
  if (number.length > 64) return NextResponse.json({ error: 'Identifier is too long' }, { status: 400 })
  if (!/^[a-z0-9_.]+$/.test(number)) {
    return NextResponse.json({ error: 'Use a DiviGo username, phone number, or Telegram ID — no special characters' }, { status: 400 })
  }
  if (!VALID_ROUTES.has(route)) return NextResponse.json({ error: 'Unknown route' }, { status: 400 })

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
