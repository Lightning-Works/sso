/**
 * GET /api/divigo/tokens — enabled custom ERC-20 tokens, for the wallet UI.
 *
 * Open to any signed-in user (read-only, no secrets). Returns only `enabled`
 * rows. The user wallet doesn't surface these as live balances yet because
 * DiviGo can't pool/send them (see docs/DIVIGO-ERC20-TOKEN-REPORT.md) — this
 * endpoint exists so the registry is ready to consume the moment it can.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db
    .from('divigo_custom_tokens')
    .select('id, chain, contract_address, symbol, name, decimals, divigo_slug, logo_url, send_enabled')
    .eq('enabled', true)
    .order('symbol')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data || [] })
}
