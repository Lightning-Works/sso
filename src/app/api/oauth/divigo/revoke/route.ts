/**
 * POST /api/oauth/divigo/revoke   — user revokes a specific app's access.
 *
 * Sets revoked_at on the grant AND deletes the app's bearer token, so any
 * cached copy on the app's server stops working on its very next call.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { audit, deleteAppToken } from '@/lib/oauth/divigo'
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

  await deleteAppToken(user.id, app.id)
  await audit(user.id, app.id, 'revoke', null)
  return NextResponse.json({ ok: true })
}
