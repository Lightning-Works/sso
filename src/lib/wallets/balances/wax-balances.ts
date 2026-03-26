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

const SYNDICATE_PLANETS = [
  { symbol: 'EYE', planet: 'Eyeke', scope: 'eyeke' },
  { symbol: 'KAV', planet: 'Kavian', scope: 'kavian' },
  { symbol: 'MAG', planet: 'Magor', scope: 'magor' },
  { symbol: 'NAR', planet: 'Naron', scope: 'naron' },
  { symbol: 'NER', planet: 'Neri', scope: 'neri' },
  { symbol: 'VEL', planet: 'Veles', scope: 'veles' },
]

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
