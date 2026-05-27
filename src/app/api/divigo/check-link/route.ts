/**
 * GET /api/divigo/check-link
 *
 * The link-flow polling endpoint. Called from the browser every 2s while
 * the "Confirm in Telegram" modal is open. For the signed-in user we:
 *   1. Find their pending row in divigo_links (must have link_token set
 *      and not be expired/verified yet).
 *   2. Hit DiviGo's existing GET /lwLoginVerify/<code> — the same endpoint
 *      that lightningworks.io/market uses.
 *   3. If DiviGo returns a populated user object, mark our row verified
 *      with their number/route/username + any wallets they sent back.
 *
 * Until DIVIGO_API_BASE points at a working DiviGo deployment, the call
 * to /lwLoginVerify returns parking-page HTML and we treat that as
 * "still pending". The moment the hostname is correct, polling lights up.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { diviGoConfigured } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

// No default — DIVIGO_API_BASE must be set to the partner's real hostname.
const BASE = (process.env.DIVIGO_API_BASE || '').replace(/\/+$/, '')

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface LwLoginVerifyResponse {
  user?: string
  code?: string
  added?: string
  number?: string | { id: number | string }
  username?: string
  route?: string
  wallets?: Record<string, { address?: string; balance?: number; balanceUSD?: number }>
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const db = svc()
  const { data: row } = await db.from('divigo_links')
    .select('user_id, link_token, token_expires_at, verified_at')
    .eq('user_id', user.id).maybeSingle()

  if (!row) return NextResponse.json({ status: 'not_started' })
  if (row.verified_at) return NextResponse.json({ status: 'verified' })
  if (!row.link_token) return NextResponse.json({ status: 'not_started' })
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ status: 'expired' })
  }

  if (!BASE) {
    // Hostname not configured — there's no real server we can poll yet.
    // Surface explicitly so the UI doesn't sit in 'pending' forever.
    return NextResponse.json({ status: 'pending', note: 'DIVIGO_API_BASE not set on server' })
  }
  if (!diviGoConfigured()) {
    // API key not set isn't fatal for the unauthenticated lwLoginVerify
    // path; fall through and let it return pending or verified naturally.
  }

  // Fetch DiviGo's verification endpoint. The handler is unauthenticated and
  // returns either the populated LWLogin row (with user/number/wallets) or
  // null/false if not yet linked.
  let data: LwLoginVerifyResponse | null = null
  try {
    const r = await fetch(`${BASE}/lwLoginVerify/${encodeURIComponent(row.link_token)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    const text = await r.text()
    // The DNS-parked divigo.com serves HTML; the real deployment serves JSON
    // (or `null`/`false`). Anything HTML-looking → treat as not-yet-linked.
    if (text.trimStart().startsWith('<')) {
      return NextResponse.json({ status: 'pending', note: 'DiviGo host not reachable as JSON API (likely DIVIGO_API_BASE points at a parked domain)' })
    }
    if (!r.ok) return NextResponse.json({ status: 'pending' })
    try { data = JSON.parse(text) } catch { data = null }
  } catch {
    return NextResponse.json({ status: 'pending' })
  }

  if (!data || typeof data !== 'object') return NextResponse.json({ status: 'pending' })

  // DiviGo returned a row — link is confirmed. Normalize the identifier:
  // Telegram users have `number` as an object { id: <numeric tg id> }; phone
  // routes have it as a string.
  const numStr = typeof data.number === 'object' && data.number
    ? String(data.number.id)
    : (data.number ? String(data.number) : null)
  const route = data.route ? String(data.route).toLowerCase() : 'telegram'
  const username = data.username ? String(data.username).toLowerCase() : null
  const telegramId = route.startsWith('telegram') && numStr ? numStr : null

  if (!numStr) {
    // Bot stored the row but didn't include a number — treat as still pending
    // and let next poll retry.
    return NextResponse.json({ status: 'pending' })
  }

  // Refuse if this DiviGo (number, route) is linked to a different SSO user.
  const { data: dup } = await db.from('divigo_links')
    .select('user_id').eq('divigo_number', numStr).eq('divigo_route', route)
    .neq('user_id', user.id).maybeSingle()
  if (dup) {
    return NextResponse.json({ status: 'error', error: 'That DiviGo account is already linked to another SSO user' }, { status: 409 })
  }

  await db.from('divigo_links').update({
    divigo_number: numStr,
    divigo_route: route,
    divigo_username: username,
    telegram_id: telegramId,
    verified_at: new Date().toISOString(),
    link_token: null,
    token_expires_at: null,
    last_balance: data.wallets || null,
  }).eq('user_id', user.id)

  return NextResponse.json({ status: 'verified' })
}
