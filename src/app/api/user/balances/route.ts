/**
 * GET /api/user/balances?username=xxx
 * Returns token balances across all connected wallets for a user
 * Fetches live data from Helius (Solana), Alchemy (EVM), and WAX RPC
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAllBalances } from '@/lib/wallets/balances'
import type { WalletChain } from '@/lib/wallets/types'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    const userId = searchParams.get('id')

    if (!username && !userId) {
      return NextResponse.json({ error: 'username or id required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Look up user
    let targetId = userId
    if (username && !targetId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .single()
      if (!profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      targetId = profile.id
    }

    // Get wallets
    const { data: wallets, error } = await supabase
      .from('connected_wallets')
      .select('chain_type, wallet_address')
      .eq('user_id', targetId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ user_id: targetId, balances: [], wallets: 0 })
    }

    // Fetch balances from all chains
    const walletInputs = wallets.map(w => ({
      chain: w.chain_type as WalletChain,
      address: w.wallet_address,
    }))

    const balances = await getAllBalances(walletInputs)

    return NextResponse.json({
      user_id: targetId,
      wallets: wallets.length,
      balances: balances.map(b => ({
        symbol: b.symbol,
        name: b.name,
        balance: b.balance,
        chain: b.chain,
        wallet_address: b.walletAddress,
        token_address: b.address || null,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
