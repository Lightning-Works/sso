/**
 * POST /api/oauth/divigo/grant   — user grants a specific app DiviGo access.
 *
 * Session-based (SSO cookie). Called from the consent screen at
 * /wallet/divi/grant. Apps DO NOT call this directly — they redirect the
 * user there.
 *
 * Body: { app_slug, scopes[] }
 *
 * On success we:
 *   1. Upsert the divigo_app_grants row (clears any prior revoked_at).
 *   2. Mint a fresh per-(user, app) bearer token; any prior token is
 *      deleted so re-granting always rotates credentials.
 *   3. Return the plaintext token — the consent screen forwards it to
 *      the app's callback URL once, in the URL fragment.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ALL_SCOPES, audit, mintAppToken } from '@/lib/oauth/divigo'
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

  // Upsert the grant; clear revoked_at so a previously revoked user can
  // grant again without admin intervention.
  const { error: grantErr } = await db.from('divigo_app_grants').upsert({
    user_id: user.id,
    app_id: app.id,
    scopes,
    granted_at: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: 'user_id,app_id' })
  if (grantErr) return NextResponse.json({ error: grantErr.message }, { status: 500 })

  // Mint (rotate) the bearer token.
  const token = await mintAppToken(user.id, app.id)

  await audit(user.id, app.id, 'grant', { scopes })
  return NextResponse.json({ ok: true, scopes, app_token: token })
}
