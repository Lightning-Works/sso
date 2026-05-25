/**
 * GET /api/divigo/status
 *
 * Tells the client:
 *   - configured  — is DIVIGO_API_KEY present on the server?
 *   - projectName — the company name shown in Telegram approval prompts
 *   - linked      — is there a row in divigo_links for this user?
 *   - verified    — has the link been confirmed via the bot callback?
 *   - pending     — is there an unverified link with a still-live token? The
 *                   client uses this to keep polling while the user is on the
 *                   "open Telegram, tap Start" screen.
 *   - link        — the linked-account details (only when verified)
 *
 * No secrets leak: we never return the API key, only a boolean.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { diviGoConfigured, diviGoProjectName } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const configured = diviGoConfigured()
  const projectName = diviGoProjectName() || null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ configured, projectName, linked: false, verified: false, pending: false, link: null })
  }

  const { data: row } = await svc()
    .from('divigo_links')
    .select('divigo_number, divigo_route, divigo_username, telegram_id, linked_at, last_verified_at, verified_at, link_token, token_expires_at')
    .eq('user_id', user.id).maybeSingle()

  if (!row) {
    return NextResponse.json({ configured, projectName, linked: false, verified: false, pending: false, link: null })
  }

  const verified = !!row.verified_at
  const pending = !verified && !!row.link_token && !!row.token_expires_at
    && new Date(row.token_expires_at).getTime() > Date.now()

  return NextResponse.json({
    configured,
    projectName,
    linked: verified,
    verified,
    pending,
    link: verified ? {
      divigo_number: row.divigo_number,
      divigo_route: row.divigo_route,
      divigo_username: row.divigo_username,
      telegram_id: row.telegram_id,
      linked_at: row.linked_at,
      last_verified_at: row.last_verified_at,
    } : null,
  })
}
