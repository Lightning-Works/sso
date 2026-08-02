/**
 * POST /api/aw/admin/mining/snapshot  (superadmin only)
 *
 * Forward-collection: pages through m.federation.miners (cursor stored in
 * aw_collector_state), snapshots each recently-active miner's current loadout
 * (bag tools + land) with per-tool stats resolved from AtomicAssets, and writes
 * rows to aw_miner_snapshots. Each call advances the cursor by one page, so a
 * cron (or repeated clicks) walks the whole active population over time.
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isMiningAdmin } from '@/lib/auth/miningAdmin'
import { createClient as svc } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const RPC = 'https://wax.greymass.com'
const AA = 'https://wax.api.atomicassets.io/atomicassets/v1'
const PAGE = 100
const ACTIVE_DAYS = 5

function db() {
  return svc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
async function rows(code: string, table: string, scope: string, opts: Record<string, unknown> = {}) {
  const r = await fetch(`${RPC}/v1/chain/get_table_rows`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, table, scope, json: true, limit: PAGE, ...opts }),
  })
  const d = await r.json()
  return { rows: d.rows || [], more: d.more, next: d.next_key }
}
const num = (v: unknown) => Number(v) || 0

export async function POST(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isMiningAdmin(ctx)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const supa = db()
  // cursor
  const { data: st } = await supa.from('aw_collector_state').select('value').eq('key', 'snapshot_cursor').maybeSingle()
  const lower = (st?.value as { next?: string } | null)?.next || ''

  // page of miners
  const page = await rows('m.federation', 'miners', 'm.federation', lower ? { lower_bound: lower } : {})
  const cutoff = Date.now() - ACTIVE_DAYS * 86400 * 1000
  const active = page.rows.filter((m: Record<string, unknown>) => {
    const t = m.last_mine ? Date.parse(`${m.last_mine}Z`) : 0
    return t >= cutoff
  })

  // gather bags for active miners (bags table keyed by account)
  const snapshots: Record<string, unknown>[] = []
  const allToolIds = new Set<string>()
  for (const m of active) {
    const miner = String(m.miner)
    const bag = await rows('m.federation', 'bags', 'm.federation', { lower_bound: miner, upper_bound: miner, limit: 1 })
    const items: string[] = (bag.rows[0]?.items as string[]) || []
    items.forEach(i => allToolIds.add(String(i)))
    snapshots.push({
      miner, land_asset_id: m.current_land ? String(m.current_land) : null,
      tool_ids: items, last_mine: m.last_mine ? `${m.last_mine}Z` : null,
      last_mine_tx: m.last_mine_tx || null, tools: [], total_luck: 0, total_delay: 0, total_ease: 0,
    })
  }

  // resolve tool stats in one AtomicAssets batch
  const stat: Record<string, { template_id: string; shine: string; delay: number; luck: number; ease: number; rarity: string }> = {}
  const ids = [...allToolIds]
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE)
    const r = await fetch(`${AA}/assets?ids=${chunk.join(',')}&limit=${PAGE}`)
    if (!r.ok) continue
    const d = await r.json()
    for (const a of d.data || []) {
      const tpl = a.template || {}
      const im = { ...(tpl.immutable_data || {}), ...(a.data || {}) }
      stat[String(a.asset_id)] = {
        template_id: tpl.template_id ? String(tpl.template_id) : '',
        shine: String(im.shine || ''), delay: num(im.delay), luck: num(im.luck),
        ease: num(im.ease), rarity: String(im.rarity || ''),
      }
    }
  }
  for (const s of snapshots) {
    const tools = (s.tool_ids as string[]).map(id => stat[id]).filter(Boolean)
    s.tools = tools
    s.total_luck = tools.reduce((x, t) => x + t.luck, 0)
    s.total_delay = tools.reduce((x, t) => x + t.delay, 0)
    s.total_ease = tools.reduce((x, t) => x + t.ease, 0)
  }

  if (snapshots.length) await supa.from('aw_miner_snapshots').insert(snapshots)

  // advance cursor (wrap to start when the table is exhausted)
  const next = page.more ? page.next : ''
  await supa.from('aw_collector_state').upsert({ key: 'snapshot_cursor', value: { next }, updated_at: new Date().toISOString() })

  return NextResponse.json({ scanned: page.rows.length, active: active.length, snapshotted: snapshots.length, wrapped: !page.more, nextCursor: next })
}
