/**
 * GET /api/oauth/divigo/check?code=<code>
 *
 * App-mediated poll. Requires `send:request` scope (same scope as the
 * request — checking status is part of the send flow).
 *
 * Crucially we verify the code was created by THIS app for THIS user. An
 * app can't peek at another app's request statuses.
 *
 * Returns:
 *   { status: 'pending' }
 *   { status: 'completed', completed: <DiviGo's paymentRequestCompleted payload> }
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { withAppAndUser, audit, rateLimit, OAuthError } from '@/lib/oauth/divigo'
import { checkRequest, diviGoConfigured, DiviGoNotConfiguredError } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  try {
    const ctx = await withAppAndUser(request, 'send:request')
    // High cap on checks (apps poll every ~3s). Still bounded per user+app
    // so one app can't burn another's quota.
    await rateLimit(ctx.user.id, ctx.app.id, 'send.check', 600)

    if (!diviGoConfigured()) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }

    const code = new URL(request.url).searchParams.get('code')?.trim()
    if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 })

    const db = svc()
    const { data: row } = await db.from('divigo_requests')
      .select('id, user_id, app_id, completed_at, completed_data')
      .eq('code', code).maybeSingle()
    if (!row || row.user_id !== ctx.user.id || row.app_id !== ctx.app.id) {
      return NextResponse.json({ error: 'unknown_code' }, { status: 404 })
    }

    if (row.completed_at) {
      return NextResponse.json({ status: 'completed', completed: row.completed_data })
    }

    try {
      const result = await checkRequest(code)
      if (!result) {
        await audit(ctx.user.id, ctx.app.id, 'send.check', { code, status: 'pending' })
        return NextResponse.json({ status: 'pending' })
      }
      await db.from('divigo_requests').update({
        completed_at: new Date().toISOString(),
        completed_data: typeof result === 'object' ? result : { value: result },
      }).eq('id', row.id)
      await audit(ctx.user.id, ctx.app.id, 'send.check', { code, status: 'completed' })
      return NextResponse.json({ status: 'completed', completed: result })
    } catch (e) {
      if (e instanceof DiviGoNotConfiguredError) {
        return NextResponse.json({ error: 'not_configured' }, { status: 503 })
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : 'check_failed' }, { status: 502 })
    }
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'internal', message: String(e) }, { status: 500 })
  }
}
