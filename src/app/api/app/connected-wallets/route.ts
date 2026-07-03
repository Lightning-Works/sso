/**
 * POST /api/app/connected-wallets   — server-to-server, app-credential auth (X-LW-App-Slug + Secret,
 * the existing Dreadroot↔SSO link). Given a user's { email }, returns the wallet addresses that user
 * has CONNECTED (and thereby proven ownership of) in the SSO — Phantom/Solflare (solana), MetaMask
 * (evm), WAX, Divi. Games use this to source ownership-PROVEN addresses for token-gating instead of
 * trusting a pasted address. Read-only. NOT public.
 *
 * Body: { email }  ->  { wallets: [{ chain, address }] }   (chain = 'solana' | 'evm' | 'wax' | 'divi')
 * Requires headers: X-LW-App-Slug + X-LW-App-Secret (a registered, divigo-enabled app).
 * Requires the DB function public.app_wallets_by_email(text) (see docs/SOLANA_INTEGRATION_SETUP.md).
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { statusContext, OAuthError } from '@/lib/oauth/divigo'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  try {
    await statusContext(request)   // validates X-LW-App-Slug/Secret; throws OAuthError otherwise
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { email?: string }
  const email = (body.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const { data, error } = await svc().rpc('app_wallets_by_email', { p_email: email })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const wallets = ((data as { chain_type: string; wallet_address: string }[]) ?? [])
    .map((w) => ({ chain: w.chain_type, address: w.wallet_address }))
  return NextResponse.json({ email, wallets })
}
