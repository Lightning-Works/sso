/**
 * GET /api/divi-holdings?address=<divi-address>
 *
 * Public on-chain DIVI balance for a self-custody Divi address (via the Divi RPC). Consumed
 * server-to-server by game clients (Dreadroot) to mirror into their token-gating tables. Public
 * address-keyed read, no auth.
 */
import { NextResponse } from 'next/server'
import { getDiviBalance } from '@/lib/wallets/balances/divi-balances'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  try {
    const amount = await getDiviBalance(address)
    return NextResponse.json({ address, tokens: [{ symbol: 'DIVI', contract: null, amount, decimals: 8 }] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
