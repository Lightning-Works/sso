/**
 * Mining Data forward-collector (server-side, shared by the admin button and
 * the Vercel cron).
 *
 * Active miners are discovered from Hyperion (recent m.federation::mine
 * actions) — the miners table is keyed by account name with no time index, so
 * its first pages are long-dead 2021 accounts. Each run pulls a window of
 * recent mines, dedupes the miners, skips any snapshotted in the last few
 * hours, then snapshots the rest: current bag tools + land, with per-tool stats
 * (incl. shine) from AtomicAssets. A rotating `skip` cursor walks back through
 * recent history across runs, then wraps.
 */
import { createClient as svc } from '@supabase/supabase-js'

const RPC = 'https://wax.greymass.com'
const AA = 'https://wax.api.atomicassets.io/atomicassets/v1'
const HYPERIONS = ['https://wax.eosusa.io', 'https://api.waxsweden.org', 'https://wax.eosphere.io', 'https://wax.cryptolions.io']
const RECENT_LIMIT = 500        // mine actions per Hyperion page
const MAX_PER_RUN = 60          // miners snapshotted per run (fits the serverless limit)
const RESNAPSHOT_HOURS = 6      // don't re-snapshot the same miner within this window
const MAX_SKIP = 9000           // Hyperion skip ceiling before wrapping to newest
const BATCH = 100
const CONC = 8

function db() {
  return svc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const num = (v: unknown) => Number(v) || 0
const parseTs = (t?: string) => (t ? Date.parse(t.endsWith('Z') ? t : `${t}Z`) : 0)

async function rows(code: string, table: string, scope: string, opts: Record<string, unknown> = {}) {
  const r = await fetch(`${RPC}/v1/chain/get_table_rows`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, table, scope, json: true, limit: 1, ...opts }),
  })
  const d = await r.json()
  return d.rows || []
}

async function recentMiners(skip: number): Promise<{ miners: string[]; oldest: number } | null> {
  for (const h of HYPERIONS) {
    try {
      const r = await fetch(`${h}/v2/history/get_actions?account=m.federation&act.name=mine&limit=${RECENT_LIMIT}&skip=${skip}&sort=desc`, { signal: AbortSignal.timeout(12000) })
      if (!r.ok) continue
      const d = await r.json()
      const acts: Record<string, unknown>[] = d.actions || []
      if (!acts.length) continue
      const miners = [...new Set(acts.map(a => (a.act as { data?: { miner?: string } })?.data?.miner).filter(Boolean).map(String))]
      const oldest = Math.min(...acts.map(a => parseTs(a.timestamp as string) || Date.now()))
      return { miners, oldest }
    } catch { /* try next Hyperion */ }
  }
  return null
}

export type SnapshotResult = { scanned: number; active: number; snapshotted: number; wrapped: boolean; nextCursor: number; note?: string }

export async function runSnapshotPage(): Promise<SnapshotResult> {
  const supa = db()
  const { data: st } = await supa.from('aw_collector_state').select('value').eq('key', 'snapshot_cursor').maybeSingle()
  const skip = num((st?.value as { skip?: number } | null)?.skip)

  const rec = await recentMiners(skip)
  if (!rec) return { scanned: 0, active: 0, snapshotted: 0, wrapped: false, nextCursor: skip, note: 'no Hyperion reachable' }

  // Skip miners snapshotted recently.
  const since = new Date(Date.now() - RESNAPSHOT_HOURS * 3600 * 1000).toISOString()
  const { data: recent } = await supa.from('aw_miner_snapshots').select('miner').gte('captured_at', since).in('miner', rec.miners)
  const done = new Set((recent || []).map(r => r.miner as string))
  const todo = rec.miners.filter(m => !done.has(m)).slice(0, MAX_PER_RUN)

  // Read each miner's current land + bag (parallel, bounded).
  const snaps: Record<string, unknown>[] = []
  const allToolIds = new Set<string>()
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC)
    const results = await Promise.all(batch.map(async miner => {
      const [minerRow, bagRow] = await Promise.all([
        rows('m.federation', 'miners', 'm.federation', { lower_bound: miner, upper_bound: miner }),
        rows('m.federation', 'bags', 'm.federation', { lower_bound: miner, upper_bound: miner }),
      ])
      return { miner, m: minerRow[0] || {}, items: (bagRow[0]?.items as string[]) || [] }
    }))
    for (const { miner, m, items } of results) {
      items.forEach(id => allToolIds.add(String(id)))
      snaps.push({
        miner, land_asset_id: m.current_land ? String(m.current_land) : null,
        tool_ids: items, last_mine: m.last_mine ? `${m.last_mine}Z` : null,
        last_mine_tx: m.last_mine_tx || null, tools: [], total_luck: 0, total_delay: 0, total_ease: 0,
      })
    }
  }

  // Resolve tool stats (incl. shine) from AtomicAssets.
  const stat: Record<string, { template_id: string; name: string; shine: string; delay: number; luck: number; ease: number; rarity: string }> = {}
  const ids = [...allToolIds]
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const r = await fetch(`${AA}/assets?ids=${chunk.join(',')}&limit=${BATCH}`)
    if (!r.ok) continue
    const d = await r.json()
    for (const a of d.data || []) {
      const tpl = a.template || {}
      const im = { ...(tpl.immutable_data || {}), ...(a.data || {}) }
      stat[String(a.asset_id)] = {
        template_id: tpl.template_id ? String(tpl.template_id) : '',
        name: String(im.name || ''),
        shine: String(im.shine || ''), delay: num(im.delay), luck: num(im.luck), ease: num(im.ease), rarity: String(im.rarity || ''),
      }
    }
  }
  for (const s of snaps) {
    const tools = (s.tool_ids as string[]).map(id => stat[id]).filter(Boolean)
    s.tools = tools
    s.total_luck = tools.reduce((x, t) => x + t.luck, 0)
    s.total_delay = tools.reduce((x, t) => x + t.delay, 0)
    s.total_ease = tools.reduce((x, t) => x + t.ease, 0)
  }

  if (snaps.length) await supa.from('aw_miner_snapshots').insert(snaps)

  // Advance skip; wrap to newest once we've paged deep or reached >7-day-old mines.
  const wrapped = skip + RECENT_LIMIT > MAX_SKIP || rec.oldest < Date.now() - 7 * 86400 * 1000
  const nextCursor = wrapped ? 0 : skip + RECENT_LIMIT
  await supa.from('aw_collector_state').upsert({ key: 'snapshot_cursor', value: { skip: nextCursor }, updated_at: new Date().toISOString() })

  return { scanned: rec.miners.length, active: todo.length, snapshotted: snaps.length, wrapped, nextCursor }
}
