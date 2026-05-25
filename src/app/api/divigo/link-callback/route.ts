/**
 * POST /api/divigo/link-callback
 *
 * Called by DiviGo's Telegram bot when a user taps the Start button on a
 * t.me/DiviGoBot?start=lwsso_<token> deep link. The bot tells us who they
 * are; we look up the pending row by token, fill in the identity, and
 * mark verified. The next /status poll from the SSO user's browser sees
 * verified_at set and unlocks the wallet panel.
 *
 * Headers:
 *   X-DiviGo-Shared-Secret  — must equal LW_SSO_DIVIGO_SHARED_SECRET env var.
 *                             Prevents random callers from completing arbitrary
 *                             pending links by guessing tokens.
 *
 * Body:
 *   {
 *     token: string         — the lwsso_<token> we issued in /api/divigo/link
 *     number: string        — DiviGo's `number` (phone w/o + or numeric Telegram ID)
 *     route: string         — 'telegram' | 'telegramLaunchGoat' | ...
 *     username?: string     — DiviGo @username if the user has one
 *     telegramId?: string   — Telegram numeric user ID (for telegram routes)
 *   }
 *
 * Responses:
 *   200 { ok: true }                          — verified, all good
 *   401 { error: 'bad secret' }               — header missing/wrong
 *   400 { error: 'bad payload' }              — required fields missing
 *   404 { error: 'token not found or expired' }
 *   409 { error: 'DiviGo account already linked to another SSO user' }
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(request: Request) {
  const expected = process.env.LW_SSO_DIVIGO_SHARED_SECRET || ''
  if (!expected) {
    // We never want to "accept any caller" by accident — if the secret env
    // var isn't set we refuse all callbacks.
    return NextResponse.json({ error: 'callback not configured' }, { status: 503 })
  }
  const presented = request.headers.get('x-divigo-shared-secret') || ''
  if (!constantTimeEq(presented, expected)) {
    return NextResponse.json({ error: 'bad secret' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const token = String(body.token || '').trim()
  const number = String(body.number || '').trim().toLowerCase()
  const route = String(body.route || '').trim()
  const username = body.username ? String(body.username).trim().toLowerCase() : null
  const telegramId = body.telegramId ? String(body.telegramId).trim() : null

  if (!token || !number || !route) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }

  const db = svc()

  // Find a pending row with this token that hasn't expired or been verified.
  const { data: row } = await db.from('divigo_links')
    .select('user_id, token_expires_at, verified_at')
    .eq('link_token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'token not found or expired' }, { status: 404 })
  if (row.verified_at) return NextResponse.json({ error: 'token already used' }, { status: 410 })
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'token not found or expired' }, { status: 404 })
  }

  // Refuse if this DiviGo (number, route) is already linked to a different SSO
  // user. Walking around the schema unique constraint with a clear error so the
  // partner-side bot can show the user something sensible if they ever surface it.
  const { data: dup } = await db.from('divigo_links')
    .select('user_id').eq('divigo_number', number).eq('divigo_route', route)
    .neq('user_id', row.user_id).maybeSingle()
  if (dup) return NextResponse.json({ error: 'DiviGo account already linked to another SSO user' }, { status: 409 })

  const { error } = await db.from('divigo_links').update({
    divigo_number: number,
    divigo_route: route,
    divigo_username: username,
    telegram_id: telegramId,
    verified_at: new Date().toISOString(),
    link_token: null,
    token_expires_at: null,
  }).eq('user_id', row.user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
