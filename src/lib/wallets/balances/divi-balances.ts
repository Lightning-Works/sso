/**
 * Divi Balance Checker
 *
 * The old hardcoded JSON-RPC endpoint (services.divi.domains/testnet/rpc/)
 * is dead — it returns 405/HTML, so every balance call was silently
 * failing and returning 0. This uses a public, no-auth MAINNET REST API
 * instead (cryptoID, verified reachable; returns the balance in DIVI as
 * a plain number). Override with NEXT_PUBLIC_DIVI_BALANCE_API if needed.
 */

import type { WalletToken } from '../types'

const DIVI_BALANCE_API =
  process.env.NEXT_PUBLIC_DIVI_BALANCE_API || 'https://chainz.cryptoid.info/divi/api.dws'

export async function getDiviBalance(address: string): Promise<number> {
  try {
    const res = await fetch(
      `${DIVI_BALANCE_API}?q=getbalance&a=${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(10000), headers: { Accept: 'text/plain' } },
    )
    if (!res.ok) {
      console.error('Divi balance HTTP', res.status)
      return 0
    }
    const text = (await res.text()).trim()
    const n = Number(text)
    if (!Number.isFinite(n)) {
      console.error('Divi balance unparseable:', text.slice(0, 80))
      return 0
    }
    return n
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
