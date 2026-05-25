/**
 * GET /api/divigo/check?code=...
 *
 * Poll the status of a transfer request previously created by this user
 * via /api/divigo/request-transfer. We verify the code belongs to the
 * signed-in user before forwarding to DiviGo — otherwise anyone could
 * scrape any code's status.
 *
 * Returns:
 *   { status: 'pending' }                          — user hasn't acted yet
 *   { status: 'completed', completed: <payload> }  — user approved or denied
 *
 * DiviGo's `check` returns the `paymentRequestCompleted` value verbatim.
 * Until we have a confirmed shape from DiviGo, anything truthy = done; the
 * client renders the raw payload so the user can see whatever DiviGo sent.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRequest, diviGoConfigured, DiviGoNotConfiguredError } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!diviGoConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const code = new URL(request.url).searchParams.get('code')?.trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const db = svc()
  const { data: row } = await db.from('divigo_requests')
    .select('id, user_id, completed_at, completed_data')
    .eq('code', code).maybeSingle()
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: 'Unknown code' }, { status: 404 })
  }

  // Cached result if we already saw completion last time we polled.
  if (row.completed_at) {
    return NextResponse.json({ status: 'completed', completed: row.completed_data })
  }

  try {
    const result = await checkRequest(code)
    // Falsy = still pending.
    if (!result) return NextResponse.json({ status: 'pending' })
    // Truthy = DiviGo wrote paymentRequestCompleted; cache + return.
    await db.from('divigo_requests').update({
      completed_at: new Date().toISOString(),
      completed_data: typeof result === 'object' ? result : { value: result },
    }).eq('id', row.id)
    return NextResponse.json({ status: 'completed', completed: result })
  } catch (e) {
    if (e instanceof DiviGoNotConfiguredError) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'check failed' }, { status: 502 })
  }
}
