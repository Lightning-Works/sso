import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getEvmNfts, getSolanaNfts, getWaxNfts } from '@/lib/blockchain/nfts'
import { upsertNfts, clearStaleNfts } from '@/lib/blockchain/cache'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const startTime = Date.now()

  const { data: wallets } = await supabase
    .from('connected_wallets')
    .select('chain_type, wallet_address')

  if (!wallets || wallets.length === 0) {
    return NextResponse.json({ status: 'no wallets', duration_ms: Date.now() - startTime })
  }

  const evmWallets = [...new Set(wallets.filter(w => w.chain_type === 'evm').map(w => w.wallet_address))]
  const solanaWallets = [...new Set(wallets.filter(w => w.chain_type === 'solana').map(w => w.wallet_address))]
  const waxWallets = [...new Set(wallets.filter(w => w.chain_type === 'wax').map(w => w.wallet_address))]

  let totalNfts = 0

  // EVM NFTs
  for (const address of evmWallets) {
    try {
      const nfts = await getEvmNfts(address)
      await upsertNfts(nfts)
      const ids = new Set(nfts.map(n => n.id))
      await clearStaleNfts(address, ids)
      totalNfts += nfts.length
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 200))
  }

  // Solana NFTs
  for (const address of solanaWallets) {
    try {
      const nfts = await getSolanaNfts(address)
      await upsertNfts(nfts)
      const ids = new Set(nfts.map(n => n.id))
      await clearStaleNfts(address, ids)
      totalNfts += nfts.length
    } catch { /* skip */ }
  }

  // WAX NFTs
  for (const address of waxWallets) {
    try {
      const nfts = await getWaxNfts(address)
      await upsertNfts(nfts)
      const ids = new Set(nfts.map(n => n.id))
      await clearStaleNfts(address, ids)
      totalNfts += nfts.length
    } catch { /* skip */ }
  }

  return NextResponse.json({
    status: 'ok',
    wallets: wallets.length,
    nfts_cached: totalNfts,
    duration_ms: Date.now() - startTime,
  })
}
