/**
 * POST /api/divigo/partner-holdings   — server-to-server, shared-secret locked.
 *
 * Given a DiviGo account { number, route }, returns the user's DIVI balance and whether they hold a
 * given NFT (e.g. the LightningWorks Portal) — DiviGo resolves their eth address internally. This
 * BYPASSES the normal per-user Telegram consent — it exists only for the one-time Siege Worlds VIP
 * backfill, where LightningWorks already operates the DiviGo accounts. It is read-only and gated by
 * LW_PARTNER_HOLDINGS_SECRET (set the same value on the calling backend). NOT a public endpoint.
 *
 * Body: { number, route?, portalContract?, portalNetwork? }   ->   { divi, hasPortal, portalCount }
 * Requires header: x-lw-partner-secret: <LW_PARTNER_HOLDINGS_SECRET>
 */
import { balance, getNfts, diviGoConfigured, type MsgRoute } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function POST(request: Request) {
  const expected = process.env.LW_PARTNER_HOLDINGS_SECRET || ''
  const got = request.headers.get('x-lw-partner-secret') || ''
  if (!expected || !got || !constEq(got, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!diviGoConfigured()) return NextResponse.json({ error: 'divigo_not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { number?: string; route?: string; portalContract?: string; portalNetwork?: 'eth' | 'poly' }
  const number = (body.number || '').trim()
  const route = (body.route || 'telegram') as MsgRoute
  const portalContract = (body.portalContract || '').trim()
  if (!number) return NextResponse.json({ error: 'number required' }, { status: 400 })

  // DIVI balance + Portal NFT check — independent, so one failing doesn't sink the other.
  const [diviRes, portalRes] = await Promise.allSettled([
    balance({ number, route, coin: 'divi' }),
    portalContract
      ? getNfts({ number, route, network: body.portalNetwork ?? 'eth', contract: portalContract })
      : Promise.resolve([] as unknown[]),
  ])
  const diviRaw = diviRes.status === 'fulfilled' ? diviRes.value : null
  const divi = typeof diviRaw === 'number' ? diviRaw : Number(diviRaw) || 0
  const portalCount = portalRes.status === 'fulfilled' ? portalRes.value.length : 0

  return NextResponse.json({ number, route, divi, hasPortal: portalCount > 0, portalCount })
}
