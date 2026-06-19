/**
 * GET /api/wax-holdings?account=<wax-account>
 *
 * Public on-chain holdings for a WAX account — fungible tokens (WAX, TLM, and the 6 Alien Worlds
 * planet/Syndicate coins) + Alien Worlds NFTs (aggregated by template). Consumed server-to-server
 * by game clients (Dreadroot) to mirror into their own token-gating tables. This is public on-chain
 * data keyed by account (same as the /wallet/wax page), so no auth — but it's read-only and bounded.
 */
import { NextResponse } from 'next/server'
import { getWaxBalances, getSyndicateTokens } from '@/lib/wallets/balances/wax-balances'
import { getWaxNfts } from '@/lib/wallets/balances/wax-nfts'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get('account')
  if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 })

  try {
    const [tokens, syndicate, nftRes] = await Promise.all([
      getWaxBalances(account),
      getSyndicateTokens(account),
      getWaxNfts(account, 1, 1000, 'alien.worlds'),
    ])

    // WAX + TLM (and any other base tokens) + the 6 planet (Syndicate) coins, as flat decimals.
    const fungible = [
      ...tokens.map(t => ({ symbol: t.symbol, contract: t.address ?? null, amount: parseFloat(t.balance) || 0, decimals: t.decimals })),
      ...syndicate.map(s => ({ symbol: s.symbol, planet: s.planet, contract: null as string | null, amount: (s.liquid || 0) + (s.staked || 0), decimals: 4 })),
    ]

    // NFTs aggregated by (collection, schema, template) with a count — what the gate rules match on.
    const byTemplate = new Map<string, { collection: string; schema: string; template_id: number; count: number }>()
    for (const n of nftRes.nfts) {
      const key = `${n.collectionName}:${n.schemaName}:${n.templateId ?? '0'}`
      const e = byTemplate.get(key)
      if (e) e.count++
      else byTemplate.set(key, { collection: n.collectionName, schema: n.schemaName, template_id: Number(n.templateId) || 0, count: 1 })
    }

    return NextResponse.json({ account, tokens: fungible, nfts: Array.from(byTemplate.values()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
