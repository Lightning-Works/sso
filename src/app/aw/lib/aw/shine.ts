/**
 * Alien Worlds "shining" (forging) — verified on-chain against s.federation.
 *
 * Mechanism (confirmed from the s.federation `lookups` recipe table AND real
 * live "Shining" transactions): combine 4 IDENTICAL tools (same template) plus a
 * small TLM fee to mint one tool of the NEXT shine tier
 * (Stone → Gold → Stardust → Antimatter → XDimension), with better luck / lower
 * delay. The 4 inputs are burned.
 *
 * The user signs ONE transaction, two actions IN THIS ORDER (matches real txs):
 *   1. alien.worlds::transfer  <fee TLM>      -> s.federation, memo "Shining"
 *   2. atomicassets::transfer  [4 asset_ids]  -> s.federation, memo "Shining"
 *
 * The recipe map (which template shines into which, and the fee) is the
 * s.federation `lookups` table: from(template) -> to(template), qty (always 4),
 * cost (TLM). Only rows with active=1 are forgeable.
 */
import type { WaxAction as AwAction } from '@/lib/wallets/waxSession'

const RPC = 'https://wax.greymass.com'
const AA = 'https://wax.api.atomicassets.io/atomicassets/v1'
const SHINE_CONTRACT = 's.federation'

export type ShineCandidate = {
  templateId: number
  name: string
  img: string | null
  shine: string          // current shine of the copies you own
  rarity: string
  count: number          // how many identical copies you own
  needed: number         // 4 - count, floored at 0 (0 when ready to forge)
  ready: boolean         // count >= 4
  toShine: string        // resulting shine after forging
  cost: string           // e.g. "20.0000 TLM" — the exact transfer quantity
  costTlm: number        // numeric fee for display
  marketUrl: string      // AtomicHub, this exact tool, cheapest first
}

type Lookup = { from: number; to: number; qty: number; cost: string; active: number }
type Meta = { name: string; img: string | null; shine: string; rarity: string }

function resolveImg(hash?: unknown): string | null {
  const h = typeof hash === 'string' ? hash : ''
  if (!h) return null
  // dweb.link first (matches the SSO wallet — ipfs.io is unreliable under load);
  // the slot <img> walks to the next gateway on error.
  return h.startsWith('http') ? h : `https://dweb.link/ipfs/${h}`
}

/** In-app deep link to OUR Market, pre-filtered to one tool (cheapest first). */
export function marketUrl(templateId: number): string {
  return `/aw/market/tools?template=${templateId}`
}

/** Read the full s.federation shine recipe table (from -> to, qty, cost). */
async function fetchLookups(): Promise<Map<number, Lookup>> {
  const map = new Map<number, Lookup>()
  let lower: string | undefined
  for (let i = 0; i < 30; i++) {
    const body: Record<string, unknown> = { code: SHINE_CONTRACT, table: 'lookups', scope: SHINE_CONTRACT, json: true, limit: 1000 }
    if (lower) body.lower_bound = lower
    const r = await fetch(`${RPC}/v1/chain/get_table_rows`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
    const d = await r.json()
    for (const row of (d.rows || []) as Lookup[]) map.set(Number(row.from), row)
    if (!d.more) break
    lower = String(d.next_key)
  }
  return map
}

/** Template metadata (name / img / shine / rarity) for a set of template ids. */
async function fetchTemplateMeta(ids: number[]): Promise<Map<number, Meta>> {
  const meta = new Map<number, Meta>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const r = await fetch(`${AA}/templates?collection_name=alien.worlds&ids=${chunk.join(',')}&limit=100`)
    if (!r.ok) continue
    const d = await r.json()
    for (const t of (d.data || []) as Record<string, unknown>[]) {
      const im = (t.immutable_data as Record<string, unknown>) || {}
      meta.set(Number(t.template_id), {
        name: String(im.name || 'Tool'), img: resolveImg(im.img ?? im.image),
        shine: String(im.shine || ''), rarity: String(im.rarity || ''),
      })
    }
  }
  return meta
}

/**
 * Find every tool the account owns 2+ of that has an active shine recipe. Sorted
 * ready-to-forge first, then closest-to-ready, then by name.
 */
export async function fetchShineCandidates(account: string): Promise<ShineCandidate[]> {
  // 1) counts per template across ALL holdings (no pagination — aggregated).
  const accRes = await fetch(`${AA}/accounts/${account}/alien.worlds`)
  if (!accRes.ok) throw new Error('failed to read holdings')
  const acc = await accRes.json()
  const counts = new Map<number, number>()
  for (const t of (acc.data?.templates || []) as { template_id: string; assets: string }[]) {
    const c = Number(t.assets) || 0
    if (c >= 2) counts.set(Number(t.template_id), c)
  }
  if (!counts.size) return []

  // 2) intersect with active shine recipes.
  const lookups = await fetchLookups()
  const usable: { tid: number; count: number; lk: Lookup }[] = []
  for (const [tid, count] of counts) {
    const lk = lookups.get(tid)
    if (lk && lk.active) usable.push({ tid, count, lk })
  }
  if (!usable.length) return []

  // 3) metadata for the from + to templates.
  const ids = new Set<number>()
  usable.forEach(u => { ids.add(u.tid); ids.add(Number(u.lk.to)) })
  const meta = await fetchTemplateMeta([...ids])

  const out: ShineCandidate[] = usable.map(u => {
    const m = meta.get(u.tid)
    const to = meta.get(Number(u.lk.to))
    const costTlm = parseFloat(String(u.lk.cost).split(' ')[0]) || 0
    return {
      templateId: u.tid,
      name: m?.name || 'Tool',
      img: m?.img || null,
      shine: m?.shine || '',
      rarity: m?.rarity || '',
      count: u.count,
      needed: Math.max(0, 4 - u.count),
      ready: u.count >= 4,
      toShine: to?.shine || 'next tier',
      cost: u.lk.cost,
      costTlm,
      marketUrl: marketUrl(u.tid),
    }
  })
  out.sort((a, b) => Number(b.ready) - Number(a.ready) || a.needed - b.needed || a.name.localeCompare(b.name))
  return out
}

/** Newest 4 asset ids of a template owned by the account (the copies to forge). */
export async function fetchForgeAssetIds(account: string, templateId: number): Promise<string[]> {
  const r = await fetch(`${AA}/assets?owner=${account}&collection_name=alien.worlds&template_id=${templateId}&limit=4&order=desc&sort=asset_id`)
  if (!r.ok) throw new Error('failed to read your copies')
  const d = await r.json()
  return ((d.data || []) as Record<string, unknown>[]).map(a => String(a.asset_id)).slice(0, 4)
}

/** Build the two forge actions (TLM fee first, then the 4 NFTs), memo "Shining". */
export function buildForgeActions(account: string, assetIds: string[], cost: string): AwAction[] {
  const authorization = [{ actor: account, permission: 'active' }]
  return [
    { account: 'alien.worlds', name: 'transfer', authorization, data: { from: account, to: SHINE_CONTRACT, quantity: cost, memo: 'Shining' } },
    { account: 'atomicassets', name: 'transfer', authorization, data: { from: account, to: SHINE_CONTRACT, asset_ids: assetIds, memo: 'Shining' } },
  ]
}
