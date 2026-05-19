/**
 * Divi Balance Checker — uses the real Divi mainnet JSON-RPC
 * (see DIVI_RPC in ../divi; default https://services.divi.domains/api/rpc/).
 *
 * Returns spendable + staking-vault balance for the address, in DIVI.
 * `getaddressbalance` returns satoshis (÷1e8). The optional `only_vaults`
 * flag returns coins locked in self-custodial Divi staking vaults; we sum
 * both so a self-custody staker sees their full on-chain total.
 *
 * NOTE: pooled / custodial holdings (e.g. DiviGo, exchanges, staking
 * pools) are NOT on the user's own address on-chain, so no RPC can show
 * them here — that balance lives in the pool operator's off-chain ledger.
 */

import type { WalletToken } from '../types'
import { DIVI_RPC } from '../divi'

async function rpcBalanceSats(address: string, onlyVaults: boolean): Promise<number> {
  const res = await fetch(DIVI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'balance',
      method: 'getaddressbalance',
      params: onlyVaults ? [{ addresses: [address] }, true] : [{ addresses: [address] }],
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Divi RPC HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`Divi RPC: ${data.error.message || 'error'}`)
  const sats = data?.result?.balance
  return typeof sats === 'number' ? sats : 0
}

export async function getDiviBalance(address: string): Promise<number> {
  try {
    const [spendable, vaulted] = await Promise.all([
      rpcBalanceSats(address, false),
      rpcBalanceSats(address, true).catch(() => 0), // only_vaults unsupported on some nodes
    ])
    return (spendable + vaulted) / 1e8
  } catch (error) {
    console.error('Divi balance error:', error)
    return 0
  }
}

/** Spendable vs. staking-vault breakdown (DIVI), for the portfolio view. */
export async function getDiviBreakdown(
  address: string,
): Promise<{ spendable: number; staked: number; total: number }> {
  try {
    const [s, v] = await Promise.all([
      rpcBalanceSats(address, false),
      rpcBalanceSats(address, true).catch(() => 0),
    ])
    const spendable = s / 1e8
    const staked = v / 1e8
    return { spendable, staked, total: spendable + staked }
  } catch (error) {
    console.error('Divi breakdown error:', error)
    return { spendable: 0, staked: 0, total: 0 }
  }
}

export async function getDiviBalances(address: string): Promise<WalletToken[]> {
  const balance = await getDiviBalance(address)
  return [{
    symbol: 'DIVI',
    name: 'Divi',
    balance: balance.toFixed(8),
    decimals: 8,
    chain: 'divi',
    walletAddress: address,
  }]
}
