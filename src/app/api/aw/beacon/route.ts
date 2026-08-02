/**
 * POST /api/aw/beacon — log an AWW visitor's IP + geo for the admin node map.
 *
 * On-chain data carries no IPs, so the only location signal we can collect is
 * from people who actually use this wallet. Captured from Vercel's geo headers.
 * Best-effort: never blocks the app, silently no-ops if the table is absent.
 * Body: { wax?: string }.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as svc } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const wax = typeof body.wax === 'string' ? body.wax.slice(0, 24) : null

    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id ?? null
    } catch { /* anonymous */ }

    const h = request.headers
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null

    await svc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .from('aw_user_ips').insert({
        user_id: userId, wax_account: wax, ip,
        country: h.get('x-vercel-ip-country'),
        region: h.get('x-vercel-ip-country-region'),
        city: h.get('x-vercel-ip-city'),
        user_agent: (h.get('user-agent') || '').slice(0, 300),
      })
  } catch { /* never surface to the user */ }
  return NextResponse.json({ ok: true })
}
