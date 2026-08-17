/**
 * POST /api/compliance/dsar  { token, action: 'export' | 'delete' }
 *  - export: returns everything we hold on the user (GDPR access/portability).
 *  - delete: runs the erasure plan — deletes what it can, keeps (anonymized) the
 *            AML/identity/consent-proof records the law requires, and returns an
 *            honest receipt of exactly what happened + what other systems must act.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConsentState } from '@/lib/compliance/consentService'
import { exportUserData, eraseUserData } from '@/lib/compliance/dsarService'
import { consentStore, dsarAdapters } from '@/lib/compliance/store'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = body?.token
    const action = body?.action
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400, headers: CORS })
    if (action !== 'export' && action !== 'delete') {
      return NextResponse.json({ error: "action must be 'export' or 'delete'" }, { status: 400, headers: CORS })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'invalid token' }, { status: 401, headers: CORS })

    if (action === 'export') {
      const bundle = await exportUserData(dsarAdapters, user.id, new Date().toISOString())
      return NextResponse.json(bundle, { headers: CORS })
    }

    // delete: region determines the (uniform) erasure plan; use the user's recorded region.
    const st = await getConsentState(consentStore, user.id)
    const regionId = st?.regionId || 'DEFAULT'
    const receipt = await eraseUserData(dsarAdapters, user.id, regionId)
    return NextResponse.json(receipt, { headers: CORS })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
}
