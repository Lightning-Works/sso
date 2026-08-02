/**
 * GET /api/aw/superadmin — is the current user the AWW Mining Data admin?
 * Used by the AWW client to decide whether to show the Admin nav group.
 * No secrets leak: returns only a boolean.
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isMiningAdmin } from '@/lib/auth/miningAdmin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const ctx = await getAdminContext(request)
  return NextResponse.json({ superadmin: isMiningAdmin(ctx) })
}
