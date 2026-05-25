/**
 * POST /api/divigo/link   — start the DiviGo-account linking flow.
 *
 * We generate a one-shot token, store it as a pending link for this SSO
 * user (10-min expiry), and return the Telegram deep-link the client will
 * open. The user taps Start in Telegram, DiviGo's bot POSTs to our
 * /api/divigo/link-callback with their DiviGo identity, and we mark the
 * link verified there.
 *
 * Body: ignored (kept for future expansion — e.g. preferred route).
 * Returns: { token, deepLink, expiresAt }
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const TOKEN_TTL_MS = 10 * 60 * 1000  // 10 minutes — long enough to switch apps, short enough to limit interception risk

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// URL-safe random token. 24 random bytes → 32 base64url chars. Enough entropy
// (≈192 bits) that an attacker can't brute-force valid tokens; short enough
// to fit cleanly in a Telegram deep-link param (Telegram allows up to 64).
function newLinkToken(): string {
  return randomBytes(24).toString('base64url')
}

// DiviGo's bot username. Hardcoded here because it's a constant of their
// product, not a config we ever flip per-environment. If they ever change
// the bot, update this single line.
const DIVIGO_BOT_HANDLE = 'DiviGoBot'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const token = newLinkToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  // Upsert a pending row. If the user already has a link (verified or
  // pending), we reset it to a fresh pending state — this is also how
  // re-linking works (e.g. switched DiviGo accounts).
  const { error } = await svc().from('divigo_links').upsert({
    user_id: user.id,
    divigo_number: null,
    divigo_route: null,
    divigo_username: null,
    telegram_id: null,
    verified_at: null,
    link_token: token,
    token_expires_at: expiresAt,
    linked_at: new Date().toISOString(),
    last_balance: null,
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    token,
    deepLink: `https://t.me/${DIVIGO_BOT_HANDLE}?start=lwsso_${token}`,
    expiresAt,
  })
}
