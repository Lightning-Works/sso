/**
 * GET /api/solana-holdings?address=<pubkey>
 *
 * Public on-chain holdings for a Solana address — SPL + SOL token balances, and NFTs (incl. compressed
 * cNFTs) aggregated per collection with a count. Consumed server-to-server by game clients (Dreadroot)
 * to mirror into their token-gating tables. Public address-keyed read, same as /api/evm-holdings and
 * /api/wax-holdings, so no auth. NOTE: Solana mints/collection addresses are base58 and CASE-SENSITIVE
 * — they are returned verbatim (not lowercased like EVM).
 */
import { NextResponse } from 'next/server'
import { getSolanaBalances } from '@/lib/wallets/balances/solana-balances'
import { getSolanaNfts } from '@/lib/wallets/balances/solana-nfts'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  try {
    const [tokenList, nftList] = await Promise.all([
      getSolanaBalances(address),
      getSolanaNfts(address),
    ])

    // NFTs aggregated by collection (what gate rules match on); track cNFTs.
    const byCollection = new Map<string, { contract: string; chain: string; collection: string; count: number; compressed: boolean }>()
    for (const n of nftList) {
      const col = n.collection || ''
      if (!col) continue
      const e = byCollection.get(col)
      if (e) { e.count++; if (n.isCompressed) e.compressed = true }
      else byCollection.set(col, { contract: col, chain: 'solana', collection: col, count: 1, compressed: !!n.isCompressed })
    }

    const tokens = tokenList.map((t) => ({
      symbol: t.symbol,
      contract: t.address ?? null,   // SPL mint (null for native SOL)
      amount: parseFloat(t.balance) || 0,
      decimals: t.decimals,
    }))

    return NextResponse.json({ address, nfts: Array.from(byCollection.values()), tokens })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
