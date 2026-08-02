/**
 * GET /api/aw/admin/mining/summary  (superadmin only)
 *
 * Dashboard read: row counts, collection cursor, most-recent snapshots, and a
 * few quick aggregates. Degrades gracefully if the schema hasn't been created
 * yet (returns ready:false so the UI can show the "run the migration" hint).
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isMiningAdmin } from '@/lib/auth/miningAdmin'
import { createClient as svc } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function db() {
  return svc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isMiningAdmin(ctx)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const supa = db()
  const count = async (t: string) => {
    const { count, error } = await supa.from(t).select('id', { count: 'exact', head: true })
    return error ? null : count ?? 0
  }

  const snapshots = await count('aw_miner_snapshots')
  if (snapshots === null) {
    return NextResponse.json({ ready: false, hint: 'Run docs/mining_data_schema.sql in Supabase to create the aw_* tables.' })
  }

  const [mineEvents, nftDrops, ips, teams] = await Promise.all([
    count('aw_mine_events'), count('aw_nft_drops'), count('aw_user_ips'), count('aw_syndicate_teams'),
  ])
  const { data: cursor } = await supa.from('aw_collector_state').select('value, updated_at').eq('key', 'snapshot_cursor').maybeSingle()
  const { data: recent } = await supa.from('aw_miner_snapshots')
    .select('miner, planet, total_luck, total_delay, tool_ids, captured_at')
    .order('captured_at', { ascending: false }).limit(20)

  return NextResponse.json({
    ready: true,
    counts: { snapshots, mineEvents, nftDrops, ips, teams },
    cursor: cursor?.value ?? null,
    lastRun: cursor?.updated_at ?? null,
    recent: recent ?? [],
  })
}
