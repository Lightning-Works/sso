/**
 * Custom ERC-20 token registry — admin CRUD.
 *
 *   GET    — list all registered tokens (superadmin)
 *   POST   — register / upsert a token (superadmin + email allowlist)
 *   DELETE — remove a token by id   (superadmin + email allowlist)
 *
 * Reads are open to any superadmin so the panel renders; writes additionally
 * require the caller's email to be on DIVIGO_TOKEN_ADMIN_EMAILS. Every write
 * is audit-logged. See docs/DIVIGO-ERC20-TOKEN-REPORT.md for why a registered
 * token can't actually be sent by DiviGo yet.
 */
import { getAdminContext } from '@/lib/auth/adminContext'
import { isTokenAdmin } from '@/lib/auth/tokenAdminAllowlist'
import { validateTokenInput } from '@/lib/divigo/tokens'
import { logEvent } from '@/lib/audit'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const ctx = await getAdminContext(request)
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data, error } = await svc()
    .from('divigo_custom_tokens')
    .select('id, chain, contract_address, symbol, name, decimals, divigo_slug, logo_url, send_enabled, enabled, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data || [], canWrite: isTokenAdmin(ctx) })
}

export async function POST(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isTokenAdmin(ctx)) {
    return NextResponse.json({ error: 'not_token_admin' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const result = validateTokenInput(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  const v = result.value

  const db = svc()
  const { data, error } = await db
    .from('divigo_custom_tokens')
    .upsert(
      {
        chain: v.chain,
        contract_address: v.contract_address,
        symbol: v.symbol,
        name: v.name,
        decimals: v.decimals,
        divigo_slug: v.divigo_slug,
        logo_url: v.logo_url,
        send_enabled: body.send_enabled === true,
        enabled: body.enabled !== false,
        created_by: ctx!.userId,
      },
      { onConflict: 'chain,contract_address' },
    )
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logEvent(db, {
    user_id: ctx!.userId,
    email: ctx!.email || undefined,
    event_type: 'divigo_token_upsert',
    event_category: 'admin',
    description: `Registered ${v.symbol} (${v.chain}) ${v.contract_address}`,
    metadata: { id: data.id, ...v, send_enabled: body.send_enabled === true },
  })

  return NextResponse.json({ id: data.id, ok: true })
}

export async function DELETE(request: Request) {
  const ctx = await getAdminContext(request)
  if (!isTokenAdmin(ctx)) {
    return NextResponse.json({ error: 'not_token_admin' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = svc()
  const { error } = await db.from('divigo_custom_tokens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logEvent(db, {
    user_id: ctx!.userId,
    email: ctx!.email || undefined,
    event_type: 'divigo_token_delete',
    event_category: 'admin',
    description: `Removed custom token ${id}`,
    metadata: { id },
  })

  return NextResponse.json({ ok: true })
}
