import { NextResponse } from 'next/server'

/**
 * GET /api/aw/wax-activity?account=<wax-account>
 *
 * Recent token + NFT transfers for a WAX account, normalised for the Activity
 * feed. Reads Hyperion history (public), trying several endpoints for resilience
 * (any one can be down/rate-limited), server-side to avoid CORS.
 */
const HYPERIONS = ['https://wax.eosusa.io', 'https://api.waxsweden.org', 'https://wax.eosphere.io', 'https://wax.cryptolions.io']

export const revalidate = 20

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

  const url = (h: string) =>
    `${h}/v2/history/get_actions?account=${account}&filter=*:transfer&limit=60&sort=desc`

  let raw: Record<string, unknown>[] | null = null
  for (const h of HYPERIONS) {
    try {
      const r = await fetch(url(h), { signal: AbortSignal.timeout(9000), next: { revalidate: 20 } })
      if (!r.ok) continue
      const d = await r.json()
      if (Array.isArray(d?.actions)) { raw = d.actions; break }
    } catch { /* next endpoint */ }
  }
  if (!raw) return NextResponse.json({ activity: [], error: 'history unavailable' }, { status: 502 })

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

  return NextResponse.json({ activity: out.slice(0, 40) })
}
