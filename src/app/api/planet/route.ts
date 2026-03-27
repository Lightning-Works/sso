import { NextResponse } from 'next/server'

const WAX_RPC = 'https://wax.greymass.com'

const PLANETS = [
  { symbol: 'EYE', planet: 'Eyeke', scope: 'eyeke' },
  { symbol: 'KAV', planet: 'Kavian', scope: 'kavian' },
  { symbol: 'MAG', planet: 'Magor', scope: 'magor' },
  { symbol: 'NAR', planet: 'Naron', scope: 'naron' },
  { symbol: 'NER', planet: 'Neri', scope: 'neri' },
  { symbol: 'VEL', planet: 'Veles', scope: 'veles' },
]

async function getTableRows(code: string, table: string, scope: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${WAX_RPC}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, table, scope, limit: 100, json: true }),
  })
  const data = await res.json()
  return data.rows || []
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const indexStr = searchParams.get('index')
  const index = parseInt(indexStr || '0', 10)

  if (index < 0 || index >= PLANETS.length) {
    return NextResponse.json({ error: 'Invalid planet index' }, { status: 400 })
  }

  const p = PLANETS[index]

  try {
    const safe = (p: Promise<Record<string, unknown>[]>) => p.catch(() => [] as Record<string, unknown>[])
    const [custRows, candRows, globRows, statRows, stakeConfigRows] = await Promise.all([
      safe(getTableRows('dao.worlds', 'custodians1', p.scope)),
      safe(getTableRows('dao.worlds', 'candidates', p.scope)),
      safe(getTableRows('dao.worlds', 'dacglobals', p.scope)),
      safe(getTableRows('token.worlds', 'stat', p.symbol)),
      safe(getTableRows('token.worlds', 'stakeconfig', p.scope)),
    ])

    // Parse globals
    const globals: Record<string, unknown> = {}
    const globData = (globRows[0]?.data || []) as { key: string; value: unknown }[]
    for (const item of globData) {
      const val = item.value
      globals[item.key] = Array.isArray(val) ? val[1] : val
    }

    const custodians = custRows.map(r => ({
      name: r.cust_name as string,
      totalVotePower: String(r.total_vote_power || '0'),
      numVoters: (r.number_voters as number) || 0,
      requestedPay: (r.requestedpay as string) || '0.0000 TLM',
      rank: (r.rank as number) || 0,
    })).sort((a, b) => parseFloat(b.totalVotePower) - parseFloat(a.totalVotePower))

    const candidates = candRows
      .filter(r => (r.is_active as number) === 1)
      .map(r => ({
        name: (r.candidate_name as string) || '',
        isActive: true,
        totalVotePower: String(r.total_vote_power || '0'),
        numVoters: (r.number_voters as number) || 0,
        requestedPay: (r.requestedpay as string) || '0.0000 TLM',
      }))
      .sort((a, b) => parseFloat(b.totalVotePower) - parseFloat(a.totalVotePower))

    const stat = statRows[0] || {}
    const stakeConfig = stakeConfigRows[0] || {}

    // Format lockupasset — it comes as an object { quantity, contract }
    const lockupRaw = globals.lockupasset
    const lockupAsset = typeof lockupRaw === 'object' && lockupRaw !== null
      ? (lockupRaw as Record<string, string>).quantity || ''
      : String(lockupRaw || '')

    // Format budget — comes as string "60000.0000 TLM" or number
    const formatBudget = (v: unknown) => {
      if (typeof v === 'string') return v
      if (typeof v === 'number') return `${v.toFixed(4)} TLM`
      return '0'
    }

    return NextResponse.json({
      planet: p.planet,
      symbol: p.symbol,
      scope: p.scope,
      custodians,
      candidates,
      numElected: (globals.numelected as number) || 5,
      periodLength: (globals.periodlength as number) || 604800,
      lastPeriodTime: (globals.lastperiodtime as string) || '',
      totalSupply: (stat.supply as string) || '0',
      maxSupply: (stat.max_supply as string) || '0',
      proposalBudget: formatBudget(globals.prop_budget_amount),
      spendingsBudget: formatBudget(globals.spendings_budget_amount),
      maxVotes: (globals.maxvotes as number) || 2,
      lockupAsset,
      minStakeTime: (stakeConfig.min_stake_time as number) || 172800,
      maxStakeTime: (stakeConfig.max_stake_time as number) || 15552000,
      stakingEnabled: (stakeConfig.enabled as number) === 1,
    })
  } catch (e) {
    console.error('Planet API error:', e)
    return NextResponse.json({ error: 'Failed to fetch planet data' }, { status: 500 })
  }
}
