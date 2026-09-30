/**
 * POST /api/agent/link-start   — begin linking the signed-in user's Telegram to their LW-SSO
 * account (the generic cross-app identity graph, platform_identities). Session-authed.
 *
 * Creates a pending row with a short-lived link_token and returns a Telegram deep link. The
 * user taps it, presses Start in the character bot, and the bot calls /api/agent/link-callback
 * with the token + their Telegram id, which verifies the row. See
 * docs/CROSS_APP_RECOGNITION_BUILD_PLAN.md (Phase 2).
 *
 * Returns: { code, deepLink, expiresAt }
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minutes: long enough to switch apps, short enough to limit interception
const PLATFORM = 'telegram'
const LINK_BOT = (process.env.AGENT_LINK_BOT_USERNAME || 'Skylie_LW_bot').replace(/^@/, '')

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function newCode(): string {
  return randomBytes(9).toString('base64url').slice(0, 12) // ~72 bits, single-use, 10-min expiry
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const db = svc()
  // Clear any prior PENDING telegram row for this user (retry / re-link). A verified row, if any,
  // is left in place until the new link is confirmed.
  await db.from('platform_identities').delete()
    .eq('user_id', user.id).eq('platform', PLATFORM).is('verified_at', null)

  const code = newCode()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  const { error } = await db.from('platform_identities').insert({
    user_id: user.id,
    platform: PLATFORM,
    platform_user_id: null,
    platform_username: null,
    verified_at: null,
    link_token: code,
    token_expires_at: expiresAt,
    linked_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    code,
    deepLink: `https://t.me/${LINK_BOT}?start=lwlink_${code}`,
    expiresAt,
  })
}
