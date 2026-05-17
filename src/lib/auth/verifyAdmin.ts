import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Verify that the request is from an admin or superadmin user.
 * Tries two authentication methods:
 * 1. Session cookie (standard Supabase SSR auth)
 * 2. Bearer token in Authorization header (same JWT format)
 * Returns the authenticated user or null.
 */
export async function verifyAdmin(request: Request) {
  // Method 1: Try session cookie
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
        return user
      }
    }
  } catch { /* cookie auth failed, try bearer */ }

  // Method 2: Try Bearer token from Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const db = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: { user }, error } = await db.auth.getUser(token)
      if (error || !user) return null

      const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
      if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
        return user
      }
    } catch { /* bearer auth failed */ }
  }

  return null
}
