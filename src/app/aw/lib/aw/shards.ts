/**
 * Alien Worlds Shards (NFT Points) + the NFT Outpost — verified on-chain against
 * the `uspts.worlds` contract.
 *
 * Shards are earned every mine (a tool's NFT-point rate drives how many) and are
 * spent at the Outpost to craft tools. On-chain:
 *   - userpoints  → your balance (redeemable_points spendable; total_points lifetime;
 *     daily_points / weekly_points = recent earning rate).
 *   - pointoffers → the craft menu: each row is a tool template_id + `required`
 *     shard cost, active within [start, end].
 *   - redeempntnft(user, offer_id) → spend the shards and mint the tool.
 */

const RPC = 'https://wax.greymass.com'
const AA = 'https://wax.api.atomicassets.io/atomicassets/v1'
const PTS = 'uspts.worlds'

export type ShardBalance = { redeemable: number; total: number; daily: number; weekly: number }
export type ShardOffer = {
  offerId: number
  templateId: number
  required: number
  name: string
  img: string | null
  rarity: string
  shine: string
  luck: number
  delay: number
  ease: number
  end: string
  affordable: boolean
  pct: number          // progress toward affording it (0-100)
}
export type ShardData = { balance: ShardBalance; offers: ShardOffer[] }

function img(hash?: unknown): string | null {
  const h = typeof hash === 'string' ? hash : ''
  if (!h) return null
  return h.startsWith('http') ? h : `https://dweb.link/ipfs/${h}`
}

async function rows(body: Record<string, unknown>) {
  const r = await fetch(`${RPC}/v1/chain/get_table_rows`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
  return (await r.json()).rows || []
}

async function fetchBalance(account: string): Promise<ShardBalance> {
  const r = await rows({ code: PTS, table: 'userpoints', scope: PTS, json: true, lower_bound: account, upper_bound: account, key_type: 'name', limit: 1 })
  const u = r[0] || {}
  return {
    redeemable: Number(u.redeemable_points) || 0,
    total: Number(u.total_points) || 0,
    daily: Number(u.daily_points) || 0,
    weekly: Number(u.weekly_points) || 0,
  }
}

async function fetchActiveOffers(): Promise<{ offerId: number; templateId: number; required: number; end: string }[]> {
  const now = new Date().toISOString().slice(0, 19)
  const out: { offerId: number; templateId: number; required: number; end: string }[] = []
  let lower: string | undefined
  for (let i = 0; i < 10; i++) {
    const body: Record<string, unknown> = { code: PTS, table: 'pointoffers', scope: PTS, json: true, limit: 1000 }
    if (lower) body.lower_bound = lower
    const r = await fetch(`${RPC}/v1/chain/get_table_rows`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
    const d = await r.json()
    for (const o of (d.rows || [])) {
      if (String(o.start) <= now && String(o.end) >= now) {
        out.push({ offerId: Number(o.id), templateId: Number(o.template_id), required: Number(o.required), end: String(o.end) })
      }
    }
    if (!d.more) break
    lower = String(d.next_key)
  }
  return out
}

async function fetchTemplateMeta(ids: number[]) {
  const meta = new Map<number, { name: string; img: string | null; rarity: string; shine: string; luck: number; delay: number; ease: number }>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const r = await fetch(`${AA}/templates?collection_name=alien.worlds&ids=${chunk.join(',')}&limit=100`)
    if (!r.ok) continue
    const d = await r.json()
    for (const t of (d.data || [])) {
      const im = (t.immutable_data as Record<string, unknown>) || {}
      meta.set(Number(t.template_id), {
        name: String(im.name || 'Tool'), img: img(im.img ?? im.image),
        rarity: String(im.rarity || ''), shine: String(im.shine || ''),
        luck: Number(im.luck) || 0, delay: Number(im.delay) || 0, ease: Number(im.ease) || 0,
      })
    }
  }
  return meta
}

export async function fetchShardData(account: string): Promise<ShardData> {
  const [balance, active] = await Promise.all([fetchBalance(account), fetchActiveOffers()])
  const meta = await fetchTemplateMeta([...new Set(active.map(o => o.templateId))])
  const offers: ShardOffer[] = active.map(o => {
    const m = meta.get(o.templateId)
    return {
      offerId: o.offerId, templateId: o.templateId, required: o.required, end: o.end,
      name: m?.name || `Tool #${o.templateId}`, img: m?.img || null,
      rarity: m?.rarity || '', shine: m?.shine || '', luck: m?.luck || 0, delay: m?.delay || 0, ease: m?.ease || 0,
      affordable: balance.redeemable >= o.required,
      pct: o.required > 0 ? Math.min(100, (balance.redeemable / o.required) * 100) : 0,
    }
  })
  offers.sort((a, b) => a.required - b.required)
  return { balance, offers }
}

/** Fuse shards into a tool at the Outpost (redeem an offer). Wallet-signed. */
export function buildRedeemActions(account: string, offerId: number) {
  return [{
    account: PTS, name: 'redeempntnft',
    authorization: [{ actor: account, permission: 'active' }],
    data: { user: account, offer_id: offerId },
  }]
}
