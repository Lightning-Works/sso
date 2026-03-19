/**
 * WAX Balance Checker via public RPC
 * Returns WAX token + any other tokens for an account
 */

import type { WalletToken } from '../types'

const WAX_RPC = 'https://wax.greymass.com'

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
