import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getEvmTokens, getSolanaTokens, getWaxTokens } from '@/lib/blockchain/tokens'
import { fetchCoinGeckoPrices, fetchDexScreenerPrices } from '@/lib/blockchain/prices'
import { upsertBalances, clearStaleBalances } from '@/lib/blockchain/cache'
import { EVM_CHAINS } from '@/lib/blockchain/rpc'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const startTime = Date.now()

  // Get all connected wallets
  const { data: wallets } = await supabase
    .from('connected_wallets')
    .select('chain_type, wallet_address')

  if (!wallets || wallets.length === 0) {
    return NextResponse.json({ status: 'no wallets', duration_ms: Date.now() - startTime })
  }

  // Group by chain
  const evmWallets = [...new Set(wallets.filter(w => w.chain_type === 'evm').map(w => w.wallet_address))]
  const solanaWallets = [...new Set(wallets.filter(w => w.chain_type === 'solana').map(w => w.wallet_address))]
  const waxWallets = [...new Set(wallets.filter(w => w.chain_type === 'wax').map(w => w.wallet_address))]

  // Fetch CoinGecko prices first (shared across all)
  const cgPrices = await fetchCoinGeckoPrices()
  let totalTokens = 0

  // Process EVM wallets
  for (const address of evmWallets) {
    const allTokens = []
    for (const chainKey of Object.keys(EVM_CHAINS)) {
      try {
        const tokens = await getEvmTokens(chainKey, address)
        allTokens.push(...tokens)
        // Rate limit: 100ms between chains
        await new Promise(r => setTimeout(r, 100))
      } catch { /* skip chain */ }
    }

    // Fetch DexScreener prices for tokens without CoinGecko price
    const unknownContracts = allTokens
      .filter(t => t.contractAddress && !cgPrices[t.symbol])
      .map(t => t.contractAddress!)
    if (unknownContracts.length > 0) {
      const { prices: dexPrices, logos } = await fetchDexScreenerPrices(unknownContracts, 'ethereum')
      for (const t of allTokens) {
        if (t.contractAddress && dexPrices[t.contractAddress]) {
          cgPrices[t.contractAddress] = dexPrices[t.contractAddress]
        }
        if (t.contractAddress && logos[t.contractAddress] && !t.logoUrl) {
          t.logoUrl = logos[t.contractAddress]
        }
      }
    }

    await upsertBalances(allTokens, cgPrices)

    const symbols = new Set(allTokens.map(t => `${t.chain}-${t.symbol}`))
    await clearStaleBalances(address, symbols)
    totalTokens += allTokens.length
  }

  // Process Solana wallets
  for (const address of solanaWallets) {
    try {
      const tokens = await getSolanaTokens(address)

      // DexScreener for SPL token prices
      const mints = tokens.filter(t => t.contractAddress).map(t => t.contractAddress!)
      if (mints.length > 0) {
        const { prices: dexPrices, logos } = await fetchDexScreenerPrices(mints, 'solana')
        for (const t of tokens) {
          if (t.contractAddress) {
            if (dexPrices[t.contractAddress]) cgPrices[t.contractAddress] = dexPrices[t.contractAddress]
            if (logos[t.contractAddress] && !t.logoUrl) t.logoUrl = logos[t.contractAddress]
          }
        }
      }

      await upsertBalances(tokens, cgPrices)
      const symbols = new Set(tokens.map(t => `${t.chain}-${t.symbol}`))
      await clearStaleBalances(address, symbols)
      totalTokens += tokens.length
    } catch { /* skip */ }
  }

  // Process WAX wallets
  for (const address of waxWallets) {
    try {
      const tokens = await getWaxTokens(address)
      await upsertBalances(tokens, cgPrices)
      const symbols = new Set(tokens.map(t => `${t.chain}-${t.symbol}`))
      await clearStaleBalances(address, symbols)
      totalTokens += tokens.length
    } catch { /* skip */ }
  }

  return NextResponse.json({
    status: 'ok',
    wallets: wallets.length,
    tokens_cached: totalTokens,
    duration_ms: Date.now() - startTime,
  })
}
