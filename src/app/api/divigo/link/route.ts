/**
 * POST /api/divigo/link   — start the DiviGo-account linking flow.
 *
 * We piggyback on DiviGo's already-deployed `LWSITELOGIN-` handler (see
 * processMessage.js ~line 298 in the DiviGoReboot repo). When the user
 * opens our Telegram deep-link and taps Start, the bot:
 *   1. Sees `/start LWSITELOGIN-<code>`, parses out the code
 *   2. Inserts a row in DiviGo's `LWLogin` collection
 *      ({ user, code, wallets, added })
 *   3. Replies in Telegram with a `lightningworks.io/market/?divigo=<code>`
 *      link — user can ignore it; we use the LWLogin row itself.
 *
 * The reverse lookup is `GET <DIVIGO_API_BASE>/lwLoginVerify/<code>`,
 * which our /api/divigo/check-link route polls. Zero new bot code on
 * DiviGo's side.
 *
 * Body: ignored (kept for future expansion — e.g. preferred route).
 * Returns: { code, deepLink, expiresAt }
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const TOKEN_TTL_MS = 10 * 60 * 1000  // 10 minutes — long enough to switch apps, short enough to limit interception risk

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// 10-char URL-safe code, matching DiviGo's own `APP.randomString(10)` style
// for payment-request codes. ≈60 bits of entropy — plenty since each code is
// single-use and expires in 10 minutes.
function newLinkCode(): string {
  // base64url over 8 bytes → 11 chars; trim to 10 for parity with their format.
  return randomBytes(8).toString('base64url').slice(0, 10)
}

// DiviGo's bot username. Hardcoded here because it's a constant of their
// product, not a config we ever flip per-environment.
const DIVIGO_BOT_HANDLE = 'DiviGoBot'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const code = newLinkCode()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  // Upsert a pending row. If the user already has a link (verified or
  // pending), we reset it — this is also how re-linking works (e.g.
  // switched DiviGo accounts).
  const { error } = await svc().from('divigo_links').upsert({
    user_id: user.id,
    divigo_number: null,
    divigo_route: null,
    divigo_username: null,
    telegram_id: null,
    verified_at: null,
    link_token: code,
    token_expires_at: expiresAt,
    linked_at: new Date().toISOString(),
    last_balance: null,
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    code,
    // Telegram deep link. When tapped, Telegram sends
    // "/start LWSSOSITELOGIN-<code>" to @DiviGoBot. DiviGo dev runs their
    // own handler for this prefix (parallel to the existing LWSITELOGIN-
    // market flow) so SSO links don't collide with marketplace logins.
    deepLink: `https://t.me/${DIVIGO_BOT_HANDLE}?start=LWSSOSITELOGIN-${code}`,
    expiresAt,
  })
}
