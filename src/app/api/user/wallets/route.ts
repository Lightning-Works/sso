/**
 * GET /api/user/wallets?username=xxx
 * Returns all connected wallet addresses for a user
 * Requires auth token in Authorization header
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    const userId = searchParams.get('id')

    if (!username && !userId) {
      return NextResponse.json({ error: 'username or id required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Look up user ID from username if needed
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

    // Get wallets — RLS will only allow reading own wallets unless superadmin
    const { data: wallets, error } = await supabase
      .from('connected_wallets')
      .select('chain_type, wallet_provider, wallet_address, connected_at')
      .eq('user_id', targetId)
      .order('connected_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    return NextResponse.json({
      user_id: targetId,
      wallets: wallets || [],
      count: wallets?.length || 0,
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
