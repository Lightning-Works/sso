/**
 * POST /api/verify
 * Verifies a user's JWT token and returns their profile
 * Used by games to validate that a user is authenticated
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, role, avatar_url')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        username: profile?.username || user.user_metadata?.username,
        display_name: profile?.display_name || user.user_metadata?.display_name,
        role: profile?.role || 'user',
        avatar_url: profile?.avatar_url,
        created_at: user.created_at,
        last_sign_in: user.last_sign_in_at,
      }
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
