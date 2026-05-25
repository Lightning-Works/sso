/**
 * POST /api/divigo/request-transfer
 *
 * Initiate a transfer — DiviGo asks the user to approve on Telegram, and
 * only sends from its pool once they say yes. Returns a request code that
 * the client polls via /api/divigo/check.
 *
 * Body: { coin, amount, destination, subject? }
 *   coin        — 'divi' | 'btc' | 'eth' | ... (the user's DiviGo coin)
 *   amount      — string or number, in coin units (e.g. "100" not satoshis)
 *   destination — the address to send to (DiviGo validates format)
 *   subject     — optional human-readable purpose, shown in the prompt
 *
 * We DON'T validate the destination format — DiviGo does that authoritatively
 * for every coin it supports, and we'd just duplicate (and lag behind) their
 * list.
 *
 * Rate limit: max 5 requests created in the last hour per user. Sends move
 * money; a runaway client or hijacked session shouldn't spam approval
 * prompts at the user's Telegram.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  requestTransfer, diviGoConfigured, diviGoProjectName,
  DiviGoNotConfiguredError, type MsgRoute,
} from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

const HOURLY_LIMIT = 5

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!diviGoConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const coin = String(body.coin || '').trim().toLowerCase()
  const amountRaw = String(body.amount ?? '').trim()
  const amount = Number(amountRaw)
  const destination = String(body.destination || '').trim()
  const subject = String(body.subject || '').trim().slice(0, 200) || 'Send from LightningWorks SSO'

  if (!coin) return NextResponse.json({ error: 'coin is required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }
  if (destination.length < 6 || destination.length > 200) {
    return NextResponse.json({ error: 'destination address looks wrong' }, { status: 400 })
  }

  const db = svc()
  const { data: link } = await db.from('divigo_links')
    .select('divigo_number, divigo_route, verified_at').eq('user_id', user.id).maybeSingle()
  if (!link || !link.verified_at || !link.divigo_number || !link.divigo_route) {
    return NextResponse.json({ error: 'not_linked' }, { status: 404 })
  }

  // Per-user rate limit on creation. Cheap, race-free enough for this volume.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await db.from('divigo_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', hourAgo)
  if ((count || 0) >= HOURLY_LIMIT) {
    return NextResponse.json({ error: `Rate limit: max ${HOURLY_LIMIT} transfer requests per hour` }, { status: 429 })
  }

  try {
    const result = await requestTransfer({
      number: link.divigo_number,
      route: link.divigo_route as MsgRoute,
      coin,
      amount: amountRaw,
      destination,
      subject,
      company: diviGoProjectName(),
    })

    // DiviGo's `request` returns one of:
    //   { error: '', code: '<10char>' }
    //   { error: 'no balance' }
    //   false                            (user/wallet doesn't exist)
    if (result === false || result === null) {
      return NextResponse.json({ error: 'DiviGo did not recognise your account (no wallet for this coin)' }, { status: 404 })
    }
    if (typeof result === 'object') {
      const r = result as { error?: string; code?: string }
      if (r.code) {
        await db.from('divigo_requests').insert({
          user_id: user.id, code: r.code, coin, amount, destination, subject,
        })
        return NextResponse.json({ code: r.code, status: 'pending', message: 'Approve in Telegram to complete' })
      }
      if (r.error) {
        return NextResponse.json({ error: r.error || 'DiviGo rejected the request' }, { status: 400 })
      }
    }
    return NextResponse.json({ error: 'Unexpected DiviGo response' }, { status: 502 })
  } catch (e) {
    if (e instanceof DiviGoNotConfiguredError) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'request failed' }, { status: 502 })
  }
}
