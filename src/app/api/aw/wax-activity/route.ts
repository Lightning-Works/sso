import { NextResponse } from 'next/server'

/**
 * GET /api/aw/wax-activity?account=<wax-account>
 *
 * Recent token + NFT transfers for a WAX account, normalised for the Activity
 * feed. Reads Hyperion history (public), trying several endpoints for resilience
 * (any one can be down/rate-limited), server-side to avoid CORS.
 */
// Full-history Hyperions first. History DEPTH varies a lot per node (some index
// only recent actions, or none for a given account), so we skip nodes that
// return nothing and use the first that actually has this account's transfers.
const HYPERIONS = ['https://wax.eosphere.io', 'https://api.waxsweden.org', 'https://wax.cryptolions.io', 'https://wax.eosusa.io']
const PER = 100          // Hyperion page size
const MAX_PAGES = 3      // up to 300 transfers back — years for a typical account
const MAX_ROWS = 300

export const revalidate = 20
export const maxDuration = 40

type Act = {
  id: string
  time: string
  dir: 'in' | 'out' | 'self'
  kind: 'token' | 'nft'
  contract: string
  symbol: string
  amount: number
  counterparty: string
  memo: string
  nftCount: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = (searchParams.get('account') || '').trim().toLowerCase()
  if (!account || !/^[a-z1-5.]{1,12}$/.test(account)) {
    return NextResponse.json({ error: 'valid account required' }, { status: 400 })
  }

  // Page back through a node's history (newest first) up to MAX_PAGES.
  const fetchNode = async (h: string): Promise<Record<string, unknown>[]> => {
    const all: Record<string, unknown>[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const u = `${h}/v2/history/get_actions?account=${account}&filter=*:transfer&limit=${PER}&skip=${page * PER}&sort=desc`
      const r = await fetch(u, { signal: AbortSignal.timeout(9000), next: { revalidate: 20 } })
      if (!r.ok) break
      const d = await r.json()
      const acts = Array.isArray(d?.actions) ? (d.actions as Record<string, unknown>[]) : []
      all.push(...acts)
      if (acts.length < PER) break // reached the end of this account's history
    }
    return all
  }

  // Use the FIRST node that actually returns transfers (history depth varies —
  // some nodes return nothing for an account that others have years of).
  let raw: Record<string, unknown>[] | null = null
  for (const h of HYPERIONS) {
    try {
      const a = await fetchNode(h)
      if (a.length) { raw = a; break }
      if (raw === null) raw = a // remember "reachable but empty" so we don't 502
    } catch { /* next endpoint */ }
  }
  if (raw === null) return NextResponse.json({ activity: [], error: 'history unavailable' }, { status: 502 })

  const out: Act[] = []
  for (const a of raw) {
    const act = (a.act as Record<string, unknown>) || {}
    if (act.name !== 'transfer') continue
    const data = (act.data as Record<string, unknown>) || {}
    const from = String(data.from || '').toLowerCase()
    const to = String(data.to || '').toLowerCase()
    if (from !== account && to !== account) continue
    const dir: Act['dir'] = from === account && to === account ? 'self' : from === account ? 'out' : 'in'
    const counterparty = dir === 'out' ? to : from
    const contract = String(act.account || '')
    const memo = String(data.memo || '')
    const id = String((a.trx_id as string) || '')
    const time = String((a.timestamp as string) || '')

    // AtomicAssets NFT transfer (asset_ids) vs fungible token (quantity "1.0000 SYM").
    if (Array.isArray(data.asset_ids)) {
      out.push({ id, time, dir, kind: 'nft', contract, symbol: 'NFT', amount: 0, counterparty, memo, nftCount: (data.asset_ids as unknown[]).length })
    } else if (typeof data.quantity === 'string' && data.quantity.includes(' ')) {
      const [amtStr, sym] = (data.quantity as string).split(' ')
      out.push({ id, time, dir, kind: 'token', contract, symbol: sym || '', amount: parseFloat(amtStr) || 0, counterparty, memo, nftCount: 0 })
    }
  }

  return NextResponse.json({ activity: out.slice(0, MAX_ROWS) })
}
