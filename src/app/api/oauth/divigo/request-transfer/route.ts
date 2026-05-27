/**
 * POST /api/oauth/divigo/request-transfer
 *
 * App-mediated send. Requires `send:request` scope.
 *
 * Body: { coin, amount, destination, subject }
 *   coin        — divi, btc, eth, ltc, doge, core, wax, tlm, fio, bnb, dash
 *   amount      — string or number, coin units
 *   destination — the app's TREASURY address (apps validate this server-side
 *                 BEFORE calling — DO NOT let game clients choose destinations)
 *   subject     — shown to the user in the Telegram approval prompt
 *
 * Headers (optional):
 *   Idempotency-Key — if a row already exists for (user, app, key) we return
 *                     its code without spamming a fresh approval prompt.
 *
 * Rate limit: 10 sends per (user, app) per hour. Audit-logged with payload.
 *
 * Telegram approval is unchanged — user still says yes in their bot chat
 * before any funds move. Apps never hold custody.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { withAppAndUser, audit, rateLimit, OAuthError } from '@/lib/oauth/divigo'
import {
  requestTransfer, diviGoConfigured, diviGoProjectName,
  DiviGoNotConfiguredError, type MsgRoute,
} from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  try {
    const ctx = await withAppAndUser(request, 'send:request')
    await rateLimit(ctx.user.id, ctx.app.id, 'send.request', 10)
    if (!diviGoConfigured()) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const coin = String(body.coin || '').trim().toLowerCase()
    const amountRaw = String(body.amount ?? '').trim()
    const amount = Number(amountRaw)
    const destination = String(body.destination || '').trim()
    const subject = String(body.subject || '').trim().slice(0, 200) || `${ctx.app.name} purchase`

    if (!coin) return NextResponse.json({ error: 'coin_required' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
    }
    if (destination.length < 6 || destination.length > 200) {
      return NextResponse.json({ error: 'invalid_destination' }, { status: 400 })
    }

    const db = svc()

    // Idempotency: if this app sent (user, key) before, return the same code
    // instead of triggering a fresh Telegram prompt.
    if (ctx.idempotencyKey) {
      const { data: existing } = await db.from('divigo_requests')
        .select('code').eq('user_id', ctx.user.id).eq('app_id', ctx.app.id)
        .eq('idempotency_key', ctx.idempotencyKey).maybeSingle()
      if (existing) {
        await audit(ctx.user.id, ctx.app.id, 'send.request', { idempotent: true, coin, amount, destination })
        return NextResponse.json({ code: existing.code, status: 'pending', idempotent: true })
      }
    }

    const { data: link } = await db.from('divigo_links')
      .select('divigo_number, divigo_route, verified_at').eq('user_id', ctx.user.id).maybeSingle()
    if (!link || !link.verified_at || !link.divigo_number || !link.divigo_route) {
      return NextResponse.json({ error: 'not_linked' }, { status: 404 })
    }

    try {
      // Subject prepends the app name so the user always knows which app is
      // asking — "DreadRoot: Buy Sword of Endless Night"
      const taggedSubject = subject.startsWith(ctx.app.name)
        ? subject
        : `${ctx.app.name}: ${subject}`

      const result = await requestTransfer({
        number: link.divigo_number,
        route: link.divigo_route as MsgRoute,
        coin,
        amount: amountRaw,
        destination,
        subject: taggedSubject,
        company: diviGoProjectName(),
      })

      if (result === false || result === null) {
        return NextResponse.json({ error: 'unknown_account' }, { status: 404 })
      }
      if (typeof result === 'object') {
        const r = result as { error?: string; code?: string }
        if (r.code) {
          await db.from('divigo_requests').insert({
            user_id: ctx.user.id,
            app_id: ctx.app.id,
            idempotency_key: ctx.idempotencyKey,
            code: r.code, coin, amount, destination, subject: taggedSubject,
          })
          await audit(ctx.user.id, ctx.app.id, 'send.request', {
            code: r.code, coin, amount, destination,
          })
          return NextResponse.json({ code: r.code, status: 'pending' })
        }
        if (r.error) {
          return NextResponse.json({ error: r.error }, { status: 400 })
        }
      }
      return NextResponse.json({ error: 'unexpected_response' }, { status: 502 })
    } catch (e) {
      if (e instanceof DiviGoNotConfiguredError) {
        return NextResponse.json({ error: 'not_configured' }, { status: 503 })
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : 'send_failed' }, { status: 502 })
    }
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'internal', message: String(e) }, { status: 500 })
  }
}
