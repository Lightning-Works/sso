/**
 * GET /api/oauth/divigo/connections
 *
 * Backs /account/connections. For the signed-in user, returns every app
 * with an active or revoked DiviGo grant, plus last-used timestamp from
 * the audit log so the UI can show "Last used X ago".
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface GrantRow {
  scopes: string[]
  granted_at: string
  revoked_at: string | null
  app_id: number
  apps: { id: number; slug: string; name: string } | { id: number; slug: string; name: string }[] | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const db = svc()
  const { data: grants } = await db.from('divigo_app_grants')
    .select('scopes, granted_at, revoked_at, app_id, apps(id, slug, name)')
    .eq('user_id', user.id)
    .order('granted_at', { ascending: false }) as { data: GrantRow[] | null }

  if (!grants || grants.length === 0) return NextResponse.json({ connections: [] })

  // Last-used per app: one cheap query that groups by app.
  const appIds = grants.map(g => g.app_id)
  const { data: audits } = await db.from('divigo_app_audit')
    .select('app_id, created_at')
    .eq('user_id', user.id).in('app_id', appIds)
    .order('created_at', { ascending: false }).limit(1000)
  const lastUsedByApp = new Map<number, string>()
  for (const a of audits || []) {
    if (!lastUsedByApp.has(a.app_id)) lastUsedByApp.set(a.app_id, a.created_at)
  }

  const connections = grants.map(g => {
    // Supabase's typed join can return either a single object or an array
    // depending on the underlying FK; normalize.
    const app = Array.isArray(g.apps) ? g.apps[0] : g.apps
    return {
      app_slug: app?.slug || '',
      app_name: app?.name || '',
      scopes: g.scopes,
      granted_at: g.granted_at,
      revoked_at: g.revoked_at,
      last_used_at: lastUsedByApp.get(g.app_id) || null,
    }
  })

  return NextResponse.json({ connections })
}
