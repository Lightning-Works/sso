/**
 * Resolve the best human-readable label for a user.
 *
 * Used by "Loaned to X" overlays and by the borrower-side "Return to X"
 * confirmation. Falls back through the chain so we always have *some*
 * identifier even for users who haven't filled in a profile.
 *
 *   display_name → username → email → phone → wallet → user-id prefix
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveUserLabel(
  db: SupabaseClient,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return ''

  const { data: profile } = await db.from('profiles')
    .select('display_name, username').eq('id', userId).maybeSingle()
  if (profile?.display_name && String(profile.display_name).trim()) {
    return String(profile.display_name).trim()
  }
  if (profile?.username && String(profile.username).trim()) {
    return String(profile.username).trim()
  }

  // auth.users has email / phone but only the admin API can read them.
  try {
    const admin = (db as unknown as { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string; phone?: string } | null } }> } } }).auth.admin
    const { data } = await admin.getUserById(userId)
    const u = data?.user
    if (u?.email) return u.email
    if (u?.phone) return u.phone
  } catch { /* not service role — skip */ }

  const { data: w } = await db.from('connected_wallets')
    .select('wallet_address').eq('user_id', userId).limit(1).maybeSingle()
  if (w?.wallet_address) {
    const a = String(w.wallet_address)
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
  }

  return userId.slice(0, 8)
}
