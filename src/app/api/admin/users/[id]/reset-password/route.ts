/**
 * POST /api/admin/users/:id/reset-password
 * Sends a Supabase password-recovery email to the user. Admin or superadmin.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/auth/adminContext'
import { logAdmin } from '@/lib/audit/logger'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const { id } = await params
  const db = getServiceDb()

  const { data: authData, error: authError } = await db.auth.admin.getUserById(id)
  if (authError || !authData?.user?.email) {
    return NextResponse.json({ error: 'User not found or has no email' }, { status: 404 })
  }
  const email = authData.user.email

  const origin = new URL(request.url).origin
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/account` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdmin(db, 'admin.user.password_reset', {
    user_id: id,
    email,
    description: `Password reset email sent by ${admin.email || admin.userId}`,
    metadata: { actor_id: admin.userId },
  })

  return NextResponse.json({ ok: true })
}
