/**
 * GET /api/evm-holdings?address=0x...&chain=ethereum
 *
 * Public on-chain holdings for an EVM address — NFTs aggregated per contract (count) + ERC-20 token
 * balances. Consumed server-to-server by game clients (Dreadroot) to mirror into their token-gating
 * tables. Public address-keyed read, same as the wallet pages, so no auth. `chain` is optional
 * (ethereum | polygon | base | …); omit to scan all supported EVM chains.
 */
import { NextResponse } from 'next/server'
import { getEvmNfts } from '@/lib/wallets/balances/evm-nfts'
import { getEvmBalances } from '@/lib/wallets/balances/evm-balances'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const chain = searchParams.get('chain') || undefined
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  try {
    const [nftList, tokenList] = await Promise.all([
      getEvmNfts(address, chain),
      getEvmBalances(address),
    ])

    // NFTs aggregated by contract (lowercased) with a count — what the gate rules match on.
    const byContract = new Map<string, { contract: string; chain: string; collection: string; count: number }>()
    for (const n of nftList) {
      const contract = (n.contractAddress || '').toLowerCase()
      if (!contract) continue
      const e = byContract.get(contract)
      if (e) e.count++
      else byContract.set(contract, { contract, chain: n.chain, collection: n.collectionName, count: 1 })
    }

    const tokens = tokenList.map(t => ({
      symbol: t.symbol,
      contract: t.address ? t.address.toLowerCase() : null,
      amount: parseFloat(t.balance) || 0,
      decimals: t.decimals,
    }))

    return NextResponse.json({ address, nfts: Array.from(byContract.values()), tokens })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
