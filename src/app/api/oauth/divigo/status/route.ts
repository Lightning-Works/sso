/**
 * GET /api/oauth/divigo/status
 *
 * Bootstrap discovery for app backends. Tells the caller:
 *   - linked: is this user's DiviGo verified?
 *   - scopes: what has the user granted THIS app?
 *
 * Accepts a bearer app-token if one's been issued (post-grant) — without
 * it we can't identify a user and return { linked: false, scopes: [] }
 * (signal to the app: redirect the user to /wallet/divi/grant to start).
 *
 * The app credentials are always required so we don't leak app enumeration.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { statusContext, OAuthError } from '@/lib/oauth/divigo'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  try {
    const { app, user } = await statusContext(request)
    if (!user) return NextResponse.json({ linked: false, scopes: [] })

    const db = svc()
    const { data: link } = await db.from('divigo_links')
      .select('verified_at').eq('user_id', user.id).maybeSingle()
    const { data: grant } = await db.from('divigo_app_grants')
      .select('scopes, revoked_at').eq('user_id', user.id).eq('app_id', app.id).maybeSingle()
    const scopes = grant && !grant.revoked_at ? (grant.scopes as string[]) : []

    return NextResponse.json({ linked: !!link?.verified_at, scopes })
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'internal', message: String(e) }, { status: 500 })
  }
}
