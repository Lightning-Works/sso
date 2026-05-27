/**
 * POST /api/oauth/divigo/grant   — user grants a specific app DiviGo access.
 *
 * Session-based (SSO cookie). NOT for apps to call — apps trigger this by
 * redirecting the user to /wallet/divi/grant, which submits this from the
 * SSO's own UI.
 *
 * Body: { app_slug: string, scopes: string[] }
 *   scopes — must be a subset of {'balance:read','send:request'}; anything
 *            else is rejected.
 *
 * If a (user, app) row already exists, we replace its scopes and clear
 * revoked_at. That way re-granting works after a previous revoke.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ALL_SCOPES, audit } from '@/lib/oauth/divigo'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const slug = String(body.app_slug || '').trim().toLowerCase()
  const requestedScopes: string[] = Array.isArray(body.scopes) ? body.scopes.map(String) : []
  const scopes = requestedScopes.filter((s: string) => (ALL_SCOPES as string[]).includes(s))

  if (!slug) return NextResponse.json({ error: 'app_slug_required' }, { status: 400 })
  if (!scopes.length) return NextResponse.json({ error: 'no_valid_scopes' }, { status: 400 })

  const db = svc()
  const { data: app } = await db.from('apps')
    .select('id, name, divigo_enabled').eq('slug', slug).maybeSingle()
  if (!app) return NextResponse.json({ error: 'unknown_app' }, { status: 404 })
  if (!app.divigo_enabled) {
    return NextResponse.json({ error: 'app_not_enabled' }, { status: 403 })
  }

  // Upsert by (user_id, app_id) — the table has that as a UNIQUE constraint.
  const { error } = await db.from('divigo_app_grants').upsert({
    user_id: user.id,
    app_id: app.id,
    scopes,
    granted_at: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: 'user_id,app_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await audit(user.id, app.id, 'grant', { scopes })
  return NextResponse.json({ ok: true, scopes })
}
