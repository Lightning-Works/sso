/**
 * POST /api/admin/users/:id/ban  — body { ban: boolean }
 * Bans (blocks login) or unbans a user. Reversible.
 * A non-superadmin cannot ban an admin/superadmin.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/auth/adminContext'
import { logAdmin } from '@/lib/audit/logger'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const FOREVER = '876000h' // ~100 years

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const { id } = await params
  if (id === admin.userId) {
    return NextResponse.json({ error: 'You cannot ban your own account' }, { status: 403 })
  }

  const { ban } = await request.json()
  const db = getServiceDb()

  const { data: target } = await db.from('profiles').select('role').eq('id', id).single()
  const targetRole = target?.role || 'user'
  if (admin.role !== 'superadmin' && (targetRole === 'admin' || targetRole === 'superadmin')) {
    return NextResponse.json({ error: 'Only a superadmin can ban an admin/superadmin' }, { status: 403 })
  }

  const { error } = await db.auth.admin.updateUserById(id, { ban_duration: ban ? FOREVER : 'none' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdmin(db, ban ? 'admin.user.ban' : 'admin.user.unban', {
    user_id: id,
    description: `User ${ban ? 'banned' : 'unbanned'} by ${admin.email || admin.userId}`,
    metadata: { actor_id: admin.userId },
  })

  return NextResponse.json({ ok: true, banned: !!ban })
}
