/**
 * WAX Balance Checker via public RPC
 * Returns WAX token + any other tokens for an account
 */

import type { WalletToken } from '../types'

const WAX_RPC = 'https://wax.greymass.com'

export interface SyndicateToken {
  symbol: string
  planet: string
  liquid: number
  staked: number
  pendingUnstakes: { amount: number; releaseTime: string }[]
  stakeDelay: number | null  // seconds, null if not set
}

export const SYNDICATE_PLANETS = [
  { symbol: 'EYE', planet: 'Eyeke', scope: 'eyeke' },
  { symbol: 'KAV', planet: 'Kavian', scope: 'kavian' },
  { symbol: 'MAG', planet: 'Magor', scope: 'magor' },
  { symbol: 'NAR', planet: 'Naron', scope: 'naron' },
  { symbol: 'NER', planet: 'Neri', scope: 'neri' },
  { symbol: 'VEL', planet: 'Veles', scope: 'veles' },
]

export interface PlanetCustodian {
  name: string
  totalVotePower: string
  numVoters: number
  requestedPay: string
  rank: number
}

export interface PlanetCandidate {
  name: string
  isActive: boolean
  totalVotePower: string
  numVoters: number
  requestedPay: string
}

export interface PlanetDaoData {
  error?: string
  planet: string
  symbol: string
  scope: string
  custodians: PlanetCustodian[]
  candidates: PlanetCandidate[]
  numElected: number
  periodLength: number  // seconds
  lastPeriodTime: string
  totalSupply: string
  maxSupply: string
  proposalBudget: string
  spendingsBudget: string
  maxVotes: number
  lockupAsset: string
  minStakeTime: number
  maxStakeTime: number
  stakingEnabled: boolean
}

export async function getPlanetDaoData(planetIndex: number): Promise<PlanetDaoData> {
  const p = SYNDICATE_PLANETS[planetIndex]
  const empty: PlanetDaoData = {
    planet: p.planet, symbol: p.symbol, scope: p.scope,
    custodians: [], candidates: [], numElected: 5, periodLength: 604800,
    lastPeriodTime: '', totalSupply: '0', maxSupply: '0',
    proposalBudget: '0', spendingsBudget: '0', maxVotes: 2,
    lockupAsset: '', minStakeTime: 172800, maxStakeTime: 15552000, stakingEnabled: false,
  }

  try {
    const safe = (p: Promise<Record<string, unknown>[]>) => p.catch(() => [] as Record<string, unknown>[])
    const [custRows, candRows, globRows, statRows, stakeConfigRows] = await Promise.all([
      safe(getTableRows('dao.worlds', 'custodians1', p.scope)),
      safe(getTableRows('dao.worlds', 'candidates', p.scope)),
      safe(getTableRows('dao.worlds', 'dacglobals', p.scope)),
      safe(getTableRows('token.worlds', 'stat', p.symbol)),
      safe(getTableRows('token.worlds', 'stakeconfig', p.scope)),
    ])

    // Parse globals key-value pairs
    const globals: Record<string, unknown> = {}
    const globData = (globRows[0]?.data || []) as { key: string; value: unknown }[]
    for (const item of globData) {
      const val = item.value
      globals[item.key] = Array.isArray(val) ? val[1] : val
    }

    const custodians: PlanetCustodian[] = custRows.map(r => ({
      name: r.cust_name as string,
      totalVotePower: String(r.total_vote_power || '0'),
      numVoters: (r.number_voters as number) || 0,
      requestedPay: (r.requestedpay as string) || '0.0000 TLM',
      rank: (r.rank as number) || 0,
    })).sort((a, b) => parseFloat(b.totalVotePower) - parseFloat(a.totalVotePower))

    const candidates: PlanetCandidate[] = candRows.map(r => ({
      name: (r.candidate_name as string) || '',
      isActive: (r.is_active as number) === 1,
      totalVotePower: String(r.total_vote_power || '0'),
      numVoters: (r.number_voters as number) || 0,
      requestedPay: (r.requestedpay as string) || '0.0000 TLM',
    })).sort((a, b) => parseFloat(b.totalVotePower) - parseFloat(a.totalVotePower))

    const stat = statRows[0] || {}
    const stakeConfig = stakeConfigRows[0] || {}

    return {
      planet: p.planet,
      symbol: p.symbol,
      scope: p.scope,
      custodians,
      candidates: candidates.filter(c => c.isActive),
      numElected: (globals.numelected as number) || 5,
      periodLength: (globals.periodlength as number) || 604800,
      lastPeriodTime: (globals.lastperiodtime as string) || '',
      totalSupply: (stat.supply as string) || '0',
      maxSupply: (stat.max_supply as string) || '0',
      proposalBudget: (globals.prop_budget_amount as string) || '0',
      spendingsBudget: (globals.spendings_budget_amount as string) || '0',
      maxVotes: (globals.maxvotes as number) || 2,
      lockupAsset: (globals.lockupasset as string) || '',
      minStakeTime: (stakeConfig.min_stake_time as number) || 172800,
      maxStakeTime: (stakeConfig.max_stake_time as number) || 15552000,
      stakingEnabled: (stakeConfig.enabled as number) === 1,
    }
  } catch (e) {
    console.error('getPlanetDaoData error:', e)
    return empty
  }
}

async function getTableRows(code: string, table: string, scope: string, lowerBound?: string, upperBound?: string): Promise<Record<string, unknown>[]> {
  const body: Record<string, unknown> = { code, table, scope, limit: 100, json: true }
  if (lowerBound) body.lower_bound = lowerBound
  if (upperBound) body.upper_bound = upperBound
  const res = await fetch(`${WAX_RPC}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return data.rows || []
}

export async function getSyndicateTokens(account: string): Promise<SyndicateToken[]> {
  const results: SyndicateToken[] = []

  // Fetch liquid balances (all symbols in one call, scoped by account)
  let liquidBalances: Record<string, number> = {}
  try {
    const rows = await getTableRows('token.worlds', 'accounts', account)
    for (const row of rows) {
      const balStr = row.balance as string
      if (balStr) {
        const [amount, symbol] = balStr.split(' ')
        liquidBalances[symbol] = parseFloat(amount)
      }
    }
  } catch { /* ignore */ }

  // Fetch staked + unstakes + staketime per planet
  await Promise.all(SYNDICATE_PLANETS.map(async ({ symbol, planet, scope }) => {
    let staked = 0
    let stakeDelay: number | null = null
    const pendingUnstakes: { amount: number; releaseTime: string }[] = []

    try {
      // Staked amount
      const stakeRows = await getTableRows('token.worlds', 'stakes', scope, account, account)
      if (stakeRows.length > 0) {
        const stakeStr = (stakeRows[0].stake as string) || '0'
        staked = parseFloat(stakeStr.split(' ')[0])
      }
    } catch { /* ignore */ }

    try {
      // Pending unstakes (scan table for this account)
      const unstakeRows = await getTableRows('token.worlds', 'unstakes', scope)
      for (const row of unstakeRows) {
        if (row.account === account) {
          const amt = parseFloat(((row.stake as string) || '0').split(' ')[0])
          pendingUnstakes.push({ amount: amt, releaseTime: row.release_time as string })
        }
      }
    } catch { /* ignore */ }

    try {
      // Stake time delay
      const timeRows = await getTableRows('token.worlds', 'staketime', scope, account, account)
      if (timeRows.length > 0) {
        stakeDelay = timeRows[0].delay as number
      }
    } catch { /* ignore */ }

    results.push({
      symbol,
      planet,
      liquid: liquidBalances[symbol] || 0,
      staked,
      pendingUnstakes,
      stakeDelay,
    })
  }))

  // Sort alphabetically by planet
  results.sort((a, b) => a.planet.localeCompare(b.planet))
  return results
}

export async function getWaxBalances(account: string): Promise<WalletToken[]> {
  const tokens: WalletToken[] = []

  try {
    // Get WAX balance
    const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'eosio.token',
        account: account,
        symbol: 'WAX',
      }),
    })
    const data = await res.json()

    if (Array.isArray(data)) {
      for (const balanceStr of data) {
        const [amount, symbol] = balanceStr.split(' ')
        tokens.push({
          symbol,
          name: symbol === 'WAX' ? 'WAX Token' : symbol,
          balance: parseFloat(amount).toFixed(4),
          decimals: 8,
          chain: 'wax',
          walletAddress: account,
        })
      }
    }

    // Check for TLM (Alien Worlds token)
    try {
      const tlmRes = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'alien.worlds',
          account: account,
          symbol: 'TLM',
        }),
      })
      const tlmData = await tlmRes.json()
      if (Array.isArray(tlmData)) {
        for (const balanceStr of tlmData) {
          const [amount, symbol] = balanceStr.split(' ')
          tokens.push({
            symbol,
            name: 'Trilium',
            balance: parseFloat(amount).toFixed(4),
            decimals: 4,
            chain: 'wax',
            walletAddress: account,
          })
        }
      }
    } catch { /* TLM check failed */ }

  } catch (e) {
    console.error('WAX balance error:', e)
  }

  return tokens
}
