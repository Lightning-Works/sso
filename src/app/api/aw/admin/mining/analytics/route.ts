/**
 * GET /api/aw/admin/mining/analytics  (superadmin only)
 * One call to the aw_mining_analytics() SQL function → all chart datasets.
 * Older snapshots stored tool template_ids without names; resolve any numeric
 * top-tool labels to real names via AtomicAssets for readability.
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isMiningAdmin } from '@/lib/auth/miningAdmin'
import { createClient as svc } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isMiningAdmin(ctx)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const supa = svc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supa.rpc('aw_mining_analytics')
  if (error) return NextResponse.json({ ready: false, error: error.message }, { status: 200 })

  const a = (data || {}) as Record<string, unknown>
  // Resolve numeric top-tool labels (template_id) → template name.
  try {
    const top = (a.top_tools as { k: string; c: number }[]) || []
    const numeric = top.filter(t => /^\d+$/.test(t.k)).map(t => t.k)
    if (numeric.length) {
      const names: Record<string, string> = {}
      await Promise.all([...new Set(numeric)].map(async id => {
        try {
          const r = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/templates/alien.worlds/${id}`)
          if (r.ok) { const d = await r.json(); names[id] = d.data?.immutable_data?.name || id }
        } catch { /* leave id */ }
      }))
      a.top_tools = top.map(t => ({ ...t, k: names[t.k] || t.k }))
    }
  } catch { /* keep ids */ }

  return NextResponse.json({ ready: true, ...a })
}
