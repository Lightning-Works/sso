/**
 * Mining Data forward-collector (server-side, shared by the admin button and
 * the Vercel cron). One call = one page of m.federation.miners: snapshot each
 * recently-active miner's current loadout (bag tools + land) with per-tool
 * stats from AtomicAssets, write to aw_miner_snapshots, advance the cursor.
 *
 * Bag reads are parallelised (bounded concurrency) so a page finishes well
 * inside Vercel's serverless time limit.
 */
import { createClient as svc } from '@supabase/supabase-js'

const RPC = 'https://wax.greymass.com'
const AA = 'https://wax.api.atomicassets.io/atomicassets/v1'
const PAGE = 100
const ACTIVE_DAYS = 5
const BAG_CONCURRENCY = 8

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

export type SnapshotResult = { scanned: number; active: number; snapshotted: number; wrapped: boolean; nextCursor: string }

export async function runSnapshotPage(): Promise<SnapshotResult> {
  const supa = db()
  const { data: st } = await supa.from('aw_collector_state').select('value').eq('key', 'snapshot_cursor').maybeSingle()
  const lower = (st?.value as { next?: string } | null)?.next || ''

  const page = await rows('m.federation', 'miners', 'm.federation', lower ? { lower_bound: lower } : {})
  const cutoff = Date.now() - ACTIVE_DAYS * 86400 * 1000
  const active = page.rows.filter((m: Record<string, unknown>) => {
    const t = m.last_mine ? Date.parse(`${m.last_mine}Z`) : 0
    return t >= cutoff
  })

  // Parallel bag reads.
  const snapshots: Record<string, unknown>[] = []
  const allToolIds = new Set<string>()
  for (let i = 0; i < active.length; i += BAG_CONCURRENCY) {
    const batch = active.slice(i, i + BAG_CONCURRENCY)
    const bags = await Promise.all(batch.map((m: Record<string, unknown>) =>
      rows('m.federation', 'bags', 'm.federation', { lower_bound: String(m.miner), upper_bound: String(m.miner), limit: 1 })))
    batch.forEach((m: Record<string, unknown>, j: number) => {
      const items: string[] = (bags[j].rows[0]?.items as string[]) || []
      items.forEach(id => allToolIds.add(String(id)))
      snapshots.push({
        miner: String(m.miner), land_asset_id: m.current_land ? String(m.current_land) : null,
        tool_ids: items, last_mine: m.last_mine ? `${m.last_mine}Z` : null,
        last_mine_tx: m.last_mine_tx || null, tools: [], total_luck: 0, total_delay: 0, total_ease: 0,
      })
    })
  }

  // Resolve tool stats in AtomicAssets batches.
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
        shine: String(im.shine || ''), delay: num(im.delay), luck: num(im.luck), ease: num(im.ease), rarity: String(im.rarity || ''),
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

  const next = page.more ? page.next : ''
  await supa.from('aw_collector_state').upsert({ key: 'snapshot_cursor', value: { next }, updated_at: new Date().toISOString() })

  return { scanned: page.rows.length, active: active.length, snapshotted: snapshots.length, wrapped: !page.more, nextCursor: next }
}
