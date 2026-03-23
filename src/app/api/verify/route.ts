/**
 * POST /api/verify
 * Verifies a user's JWT token and returns their profile
 * Used by games to validate that a user is authenticated
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS_HEADERS })
    }

    // Get profile with role and avatar details
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, role, avatar_url, avatar_outer_color, avatar_inner_color, avatar_pan_x, avatar_pan_y, avatar_zoom')
      .eq('id', user.id)
      .single()

    // Resolve avatar URL — profile upload > OAuth provider avatar
    let resolvedAvatarUrl: string | null = null
    if (profile?.avatar_url) {
      if (profile.avatar_url.startsWith('http')) {
        resolvedAvatarUrl = profile.avatar_url
      } else {
        // Storage path — generate signed URL
        const { data: signedData } = await supabase.storage.from('user_avatars').createSignedUrl(profile.avatar_url, 604800)
        if (signedData?.signedUrl) resolvedAvatarUrl = signedData.signedUrl
      }
    }
    // Fallback to OAuth provider avatar if no custom avatar
    if (!resolvedAvatarUrl) {
      const meta = user.user_metadata || {}
      resolvedAvatarUrl = meta.avatar_url || meta.picture || null
      // Check identities for provider-specific avatars
      if (!resolvedAvatarUrl && user.identities?.length) {
        for (const identity of user.identities) {
          const providerAvatar = identity.identity_data?.avatar_url || identity.identity_data?.picture
          if (providerAvatar) { resolvedAvatarUrl = providerAvatar; break }
        }
      }
    }

    // Resolve display name — profile > OAuth metadata
    const meta = user.user_metadata || {}
    const resolvedUsername = profile?.username || meta.username || meta.preferred_username || meta.user_name || ''
    const resolvedDisplayName = profile?.display_name || meta.display_name || meta.full_name || meta.name || ''

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        username: resolvedUsername,
        display_name: resolvedDisplayName,
        role: profile?.role || 'user',
        avatar_url: resolvedAvatarUrl,
        avatar_outer_color: profile?.avatar_outer_color || '#000000',
        avatar_inner_color: profile?.avatar_inner_color || '#000000',
        avatar_pan_x: profile?.avatar_pan_x ?? 0.5,
        avatar_pan_y: profile?.avatar_pan_y ?? 0.5,
        avatar_zoom: profile?.avatar_zoom ?? 1.0,
        created_at: user.created_at,
        last_sign_in: user.last_sign_in_at,
      }
    }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
