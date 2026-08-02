/**
 * GET /api/cron/mining-snapshot — Vercel Cron entry (see vercel.json).
 *
 * Runs the forward-collector one page per invocation. The cursor advances each
 * run, so scheduling this every few minutes walks the whole active-miner
 * population continuously and loops back to the start when it reaches the end.
 * Secured with CRON_SECRET, matching the other /api/cron/* jobs.
 */
import { runSnapshotPage } from '@/lib/aw/miningCollector'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runSnapshotPage())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'snapshot failed' }, { status: 502 })
  }
}
