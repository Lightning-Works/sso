/**
 * POST /api/aw/admin/mining/snapshot  (superadmin only)
 * Manual one-page run of the forward-collector (same logic the cron uses).
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isMiningAdmin } from '@/lib/auth/miningAdmin'
import { runSnapshotPage } from '@/lib/aw/miningCollector'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isMiningAdmin(ctx)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await runSnapshotPage())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'snapshot failed' }, { status: 502 })
  }
}
