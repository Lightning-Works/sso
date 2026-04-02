/**
 * Divi Balance Checker via RPC
 * Queries the Divi node for address balance
 */

import type { WalletToken } from '../types'

const DIVI_RPC = 'https://services.divi.domains/testnet/rpc/'

export async function getDiviBalance(address: string): Promise<number> {
  try {
    // Try getaddressbalance (requires addressindex on the node)
    const res = await fetch(DIVI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'balance',
        method: 'getaddressbalance',
        params: [{ addresses: [address] }],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    if (data.result && typeof data.result.balance === 'number') {
      // Balance is in satoshis (1 DIVI = 100,000,000 satoshis)
      return data.result.balance / 1e8
    }
    return 0
  } catch (error) {
    console.error('Divi balance error:', error)
    return 0
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
