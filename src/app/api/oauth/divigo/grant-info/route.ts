/**
 * GET /api/oauth/divigo/grant-info?app=<slug>
 *
 * Helper for the consent screen at /wallet/divi/grant. Returns the app's
 * display info + whether the user has DiviGo linked + any existing scopes
 * they've already granted to this app. Session-based (no app secret) so
 * the consent UI can render before the user has decided anything.
 *
 * Returns 404 if the app is unknown or not DiviGo-enabled — we don't want
 * to leak that an unrelated app exists.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const slug = (new URL(request.url).searchParams.get('app') || '').trim().toLowerCase()
  if (!slug) return NextResponse.json({ error: 'app_required' }, { status: 400 })

  const db = svc()
  const { data: app } = await db.from('apps')
    .select('id, slug, name, divigo_enabled').eq('slug', slug).maybeSingle()
  if (!app || !app.divigo_enabled) {
    return NextResponse.json({ error: 'unknown_app' }, { status: 404 })
  }

  const [{ data: link }, { data: grant }] = await Promise.all([
    db.from('divigo_links').select('verified_at').eq('user_id', user.id).maybeSingle(),
    db.from('divigo_app_grants').select('scopes, revoked_at').eq('user_id', user.id).eq('app_id', app.id).maybeSingle(),
  ])

  return NextResponse.json({
    slug: app.slug,
    name: app.name,
    linked: !!link?.verified_at,
    existingScopes: grant && !grant.revoked_at ? (grant.scopes as string[]) : [],
  })
}
