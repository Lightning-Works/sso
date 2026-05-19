/**
 * POST /api/arweave/checkout  (admin)  Body: { usd }
 * Returns a hosted Stripe checkout URL to buy Turbo upload credits with
 * a card. Credits go to the configured wallet (which signs the uploads).
 */
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { turboConfigured, turboCardCheckout, TurboNotConfigured } from '@/lib/arweave/turbo'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
  if (!turboConfigured()) {
    return NextResponse.json({ error: 'Turbo not configured (see docs/ARWEAVE-DOUBLE-FALLBACK.md)' }, { status: 503 })
  }
  const body = await request.json().catch(() => ({}))
  const usd = Math.max(5, Math.min(1000, Number(body.usd) || 0))
  if (!usd) return NextResponse.json({ error: 'usd amount required (min $5)' }, { status: 400 })
  try {
    const { url, winc } = await turboCardCheckout(usd)
    return NextResponse.json({ url, winc })
  } catch (e) {
    if (e instanceof TurboNotConfigured) return NextResponse.json({ error: e.message }, { status: 503 })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
