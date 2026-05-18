/**
 * Divi Balance Checker
 *
 * The old hardcoded JSON-RPC endpoint (services.divi.domains/testnet/rpc/)
 * is dead, so balances were silently returning 0.
 *
 * Primary: Divi's official explorer API (api.diviscan.io) `/address/<addr>`,
 * whose `balance_info.result.balance` is in satoshis (÷1e8 = DIVI).
 * Fallback: cryptoID `?q=getbalance` (returns DIVI as a plain number).
 *
 * KNOWN LIMITATION: both sources report `getaddressbalance` — i.e. the
 * SPENDABLE UTXO balance. DIVI locked in staking vaults / masternode
 * collateral is NOT counted, so a staker's address can show ~0 here even
 * though they "hold" a large amount. Accurate vault/masternode totals
 * require a Divi Core RPC node — set NEXT_PUBLIC_DIVI_API_BASE to that
 * node's explorer base when available (no code change needed).
 */

import type { WalletToken } from '../types'

const DISCAN_BASE = process.env.NEXT_PUBLIC_DIVI_API_BASE || 'https://api.diviscan.io'
const CRYPTOID = 'https://chainz.cryptoid.info/divi/api.dws'

function pickBalanceSats(json: unknown): number | null {
  // /address/:address -> { transaction_info, balance_info: { result: { balance, received } } }
  const j = json as Record<string, unknown>
  const bi = (j?.balance_info ?? j) as Record<string, unknown>
  const result = (bi?.result ?? bi) as Record<string, unknown>
  const bal = (result?.balance ?? bi?.balance) as unknown
  const n = typeof bal === 'string' ? Number(bal) : (bal as number)
  return Number.isFinite(n) ? (n as number) : null
}

export async function getDiviBalance(address: string): Promise<number> {
  // Primary: official diviscan explorer (satoshis -> DIVI)
  try {
    const res = await fetch(`${DISCAN_BASE}/address/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const sats = pickBalanceSats(await res.json())
      if (sats !== null) return sats / 1e8
    } else {
      console.error('Divi diviscan HTTP', res.status)
    }
  } catch (e) {
    console.error('Divi diviscan error:', e)
  }

  // Fallback: cryptoID getbalance (already in DIVI)
  try {
    const res = await fetch(`${CRYPTOID}?q=getbalance&a=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'text/plain' },
    })
    if (res.ok) {
      const n = Number((await res.text()).trim())
      if (Number.isFinite(n)) return n
    }
  } catch (e) {
    console.error('Divi cryptoID error:', e)
  }

  return 0
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
