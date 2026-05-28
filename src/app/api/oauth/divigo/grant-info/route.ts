/**
 * GET /api/oauth/divigo/grant-info?app=<slug>&return=<url>
 *
 * Helper for the consent screen. Returns the app's display info, the user's
 * link state, existing scopes, AND whether the provided return URL is in
 * the app's allow-list. The consent screen refuses to mint a token unless
 * `returnAllowed` is true — that closes the open-redirect hole.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isRedirectAllowed } from '@/lib/auth/redirectOrigins'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const url = new URL(request.url)
  const slug = (url.searchParams.get('app') || '').trim().toLowerCase()
  const returnUrl = url.searchParams.get('return') || ''
  if (!slug) return NextResponse.json({ error: 'app_required' }, { status: 400 })

  const db = svc()
  const { data: app } = await db.from('apps')
    .select('id, slug, name, divigo_enabled, redirect_origins').eq('slug', slug).maybeSingle()
  if (!app || !app.divigo_enabled) {
    return NextResponse.json({ error: 'unknown_app' }, { status: 404 })
  }

  const returnAllowed = !!returnUrl && isRedirectAllowed(
    returnUrl,
    app.redirect_origins || [],
    process.env.ALLOWED_REDIRECT_ORIGINS,
  )

  const [{ data: link }, { data: grant }] = await Promise.all([
    db.from('divigo_links').select('verified_at').eq('user_id', user.id).maybeSingle(),
    db.from('divigo_app_grants').select('scopes, revoked_at').eq('user_id', user.id).eq('app_id', app.id).maybeSingle(),
  ])

  return NextResponse.json({
    slug: app.slug,
    name: app.name,
    linked: !!link?.verified_at,
    existingScopes: grant && !grant.revoked_at ? (grant.scopes as string[]) : [],
    returnAllowed,
  })
}
