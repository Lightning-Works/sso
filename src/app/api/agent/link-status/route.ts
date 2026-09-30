/**
 * GET /api/agent/link-status   — the signed-in user's Telegram link state (for the account page).
 *
 * Returns: { verified, pending, username, botUsername }
 *   verified  — a confirmed Telegram link exists
 *   pending   — an unverified link with a still-live token (keep polling while the user is on
 *               the "open Telegram, press Start" screen)
 *   username  — the linked Telegram @username (when verified), display only
 * No secrets leak.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const PLATFORM = 'telegram'
const LINK_BOT = (process.env.AGENT_LINK_BOT_USERNAME || 'Skylie_LW_bot').replace(/^@/, '')

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ verified: false, pending: false, username: null, botUsername: LINK_BOT })

  const { data: rows } = await svc().from('platform_identities')
    .select('platform_username, verified_at, link_token, token_expires_at')
    .eq('user_id', user.id).eq('platform', PLATFORM)

  const verifiedRow = (rows || []).find(r => r.verified_at)
  const pendingRow = (rows || []).find(r => !r.verified_at && r.link_token && r.token_expires_at
    && new Date(r.token_expires_at).getTime() > Date.now())

  return NextResponse.json({
    verified: !!verifiedRow,
    pending: !!pendingRow && !verifiedRow,
    username: verifiedRow?.platform_username || null,
    botUsername: LINK_BOT,
  })
}
