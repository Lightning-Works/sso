import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export type AdminRole = 'admin' | 'superadmin'

export interface AdminContext {
  userId: string
  email: string | null
  role: AdminRole
}

/**
 * Like verifyAdmin(), but also returns the caller's role so routes can
 * enforce role-aware rules (e.g. only a superadmin may grant admin).
 * Tries session cookie first, then a Bearer token. Returns null if the
 * caller is not an admin/superadmin.
 */
export async function getAdminContext(request: Request): Promise<AdminContext | null> {
  // Method 1: session cookie
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
        return { userId: user.id, email: user.email ?? null, role: profile.role }
      }
    }
  } catch { /* fall through to bearer */ }

  // Method 2: Bearer token
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
        return { userId: user.id, email: user.email ?? null, role: profile.role }
      }
    } catch { /* bearer auth failed */ }
  }

  return null
}
