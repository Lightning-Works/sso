/**
 * GET  /api/compliance/consent   -> the region-specific consent screen data (no auth;
 *                                    region from geo headers or ?country=&state=).
 * POST /api/compliance/consent   -> record a user's consent { token, choices }.
 *
 * Essential processing needs no consent (contract/legal basis); this only captures
 * the OPTIONAL choices. IP is added server-side as proof of consent, not tracking.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// Pure engine (tested .js)
import { buildConsentRequest } from '@/lib/compliance/consentEngine'
import { statementPair } from '@/lib/compliance/notices'
import { recordConsent } from '@/lib/compliance/consentService'
import { consentStore, detectRegion, clientIp } from '@/lib/compliance/store'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const override = {
    country: url.searchParams.get('country') || undefined,
    usState: url.searchParams.get('state') || undefined,
  }
  const regionId = detectRegion(request, override)
  const screen = buildConsentRequest(regionId)
  // The equal-prominence data-use statements the screen must show verbatim.
  const statements = {
    data_sale: statementPair('data_sale'),
    ai_personalization: statementPair('ai_personalization'),
  }
  return NextResponse.json({ ...screen, statements }, { headers: CORS })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = body?.token
    const choices = body?.choices || {}
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400, headers: CORS })

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'invalid token' }, { status: 401, headers: CORS })

    const regionId = detectRegion(request, { country: body?.country, usState: body?.state })
    const record = await recordConsent(consentStore, {
      userId: user.id,
      regionId,
      choices,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      now: new Date().toISOString(),
    })
    // Do not echo the IP back to the client.
    return NextResponse.json(
      { ok: true, regionId: record.regionId, noticeVersion: record.noticeVersion, choices: record.choices },
      { headers: CORS },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
}
