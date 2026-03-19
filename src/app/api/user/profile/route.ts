/**
 * GET /api/user/profile?username=xxx
 * Returns public profile info for a user
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

    let query = supabase.from('profiles').select('id, username, display_name, avatar_url, created_at')

    if (username) {
      query = query.eq('username', username.toLowerCase())
    } else if (userId) {
      query = query.eq('id', userId)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: data })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
