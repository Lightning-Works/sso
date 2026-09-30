/**
 * POST /api/agent/link-callback   — server-to-server (character bot -> SSO).
 *
 * When a user taps a "?start=lwlink_<token>" deep link and presses Start in a LightningWorks
 * character bot, the bot calls this with the token + their Telegram id. We verify the pending
 * platform_identities row and mark it linked to the canonical LW-SSO user. Fails closed.
 *
 * Auth:   header X-Agent-Secret === env AGENT_FACTS_SECRET (constant-time compare).
 * Body:   { token: string, telegram_id: string|number, telegram_username?: string }
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const PLATFORM = 'telegram'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function POST(request: Request) {
  const expected = process.env.AGENT_FACTS_SECRET || ''
  const got = request.headers.get('x-agent-secret') || ''
  if (!expected || !got || !constEq(got, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { token?: string; telegram_id?: string | number; telegram_username?: string }
  const token = String(body.token || '').trim()
  const tgId = body.telegram_id != null ? String(body.telegram_id).trim() : ''
  const tgUser = body.telegram_username ? String(body.telegram_username).trim().replace(/^@/, '').toLowerCase() : null
  if (!token || !tgId) return NextResponse.json({ error: 'bad payload' }, { status: 400 })

  const db = svc()

  // Find the pending row for this token.
  const { data: row } = await db.from('platform_identities')
    .select('id, user_id, verified_at, token_expires_at')
    .eq('link_token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'token not found or expired' }, { status: 404 })
  if (row.verified_at) return NextResponse.json({ error: 'token already used' }, { status: 410 })
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'token not found or expired' }, { status: 404 })
  }

  // Is this Telegram id already verified-linked to someone?
  const { data: existing } = await db.from('platform_identities')
    .select('id, user_id')
    .eq('platform', PLATFORM).eq('platform_user_id', tgId).not('verified_at', 'is', null).maybeSingle()
  if (existing && existing.user_id !== row.user_id) {
    await db.from('platform_identities').delete().eq('id', row.id) // drop our pending row
    return NextResponse.json({ error: 'This Telegram account is already linked to another LightningWorks account' }, { status: 409 })
  }
  if (existing && existing.user_id === row.user_id) {
    await db.from('platform_identities').delete().eq('id', row.id) // already linked; drop the redundant pending row
    return NextResponse.json({ ok: true, already: true })
  }

  // One Telegram per user: remove any other verified telegram rows for this user before finalizing.
  await db.from('platform_identities').delete()
    .eq('user_id', row.user_id).eq('platform', PLATFORM).not('verified_at', 'is', null).neq('id', row.id)

  const { error } = await db.from('platform_identities').update({
    platform_user_id: tgId,
    platform_username: tgUser,
    verified_at: new Date().toISOString(),
    link_token: null,
    token_expires_at: null,
  }).eq('id', row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
