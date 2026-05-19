/** GET /api/arweave/credits — Turbo balance for the configured wallet (admin). */
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { turboConfigured, turboBalance } from '@/lib/arweave/turbo'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
  if (!turboConfigured()) return NextResponse.json({ configured: false })
  try {
    const { winc, address } = await turboBalance()
    // ~1e12 winc ≈ a few hundred MB of upload; surface raw winc + AR-ish.
    return NextResponse.json({ configured: true, winc, address, ar: (Number(winc) / 1e12).toFixed(6) })
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
