/**
 * POST /api/oauth/divigo/revoke   — user revokes a specific app's access.
 *
 * Session-based (SSO cookie). Called from /account/connections.
 *
 * Body: { app_slug: string }
 *
 * Sets revoked_at on the (user, app) row. Future calls from that app
 * immediately get 403 no_grant. The user can re-grant later via the
 * consent screen.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { audit } from '@/lib/oauth/divigo'
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
  if (!slug) return NextResponse.json({ error: 'app_slug_required' }, { status: 400 })

  const db = svc()
  const { data: app } = await db.from('apps').select('id').eq('slug', slug).maybeSingle()
  if (!app) return NextResponse.json({ error: 'unknown_app' }, { status: 404 })

  const { error } = await db.from('divigo_app_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('app_id', app.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await audit(user.id, app.id, 'revoke', null)
  return NextResponse.json({ ok: true })
}
