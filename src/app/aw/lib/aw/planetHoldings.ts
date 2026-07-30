/**
 * Per-account holdings for a syndicate panel: WAX, TLM, and the planet token
 * (liquid + staked/locked). Table logic copied from the SSO getSyndicateTokens:
 * liquid = token.worlds `accounts` (scope=account); staked = token.worlds
 * `stakes` (scope=planet, bounded by account).
 */
const RPC = 'https://wax.greymass.com'

async function rows(code: string, table: string, scope: string, bound?: string): Promise<Record<string, unknown>[]> {
  const body: Record<string, unknown> = { code, table, scope, limit: 50, json: true }
  if (bound) { body.lower_bound = bound; body.upper_bound = bound }
  const r = await fetch(`${RPC}/v1/chain/get_table_rows`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const d = await r.json()
  return d.rows || []
}

const bal = (rs: Record<string, unknown>[], sym: string): number => {
  for (const row of rs) {
    const s = String(row.balance || '')
    const [amt, symbol] = s.split(' ')
    if (symbol === sym) return parseFloat(amt) || 0
  }
  return 0
}

export type PlanetHoldings = { wax: number; tlm: number; liquid: number; staked: number }

export async function fetchPlanetHoldings(account: string, symbol: string, scope: string): Promise<PlanetHoldings> {
  const [twAcc, waxAcc, tlmAcc, stakeRows] = await Promise.all([
    rows('token.worlds', 'accounts', account).catch(() => []),
    rows('eosio.token', 'accounts', account).catch(() => []),
    rows('alien.worlds', 'accounts', account).catch(() => []),
    rows('token.worlds', 'stakes', scope, account).catch(() => []),
  ])
  const staked = stakeRows[0]?.stake ? parseFloat(String(stakeRows[0].stake).split(' ')[0]) || 0 : 0
  return { wax: bal(waxAcc, 'WAX'), tlm: bal(tlmAcc, 'TLM'), liquid: bal(twAcc, symbol), staked }
}
