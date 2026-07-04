/**
 * POST /api/app/connected-wallets   — server-to-server, app-credential auth (X-LW-App-Slug + Secret,
 * the existing Dreadroot↔SSO link). Given a user's { email }, returns the wallet addresses that user
 * has CONNECTED (and thereby proven ownership of) in the SSO — Phantom/Solflare (solana), MetaMask
 * (evm), WAX, Divi. Games use this to source ownership-PROVEN addresses for token-gating instead of
 * trusting a pasted address. Read-only. NOT public.
 *
 * Body: { email }  ->  { wallets: [{ chain, address }] }   (chain = 'solana' | 'evm' | 'wax' | 'divi')
 * Auth: header X-LW-Holdings-Secret === LW_HOLDINGS_SECRET. This is a DEDICATED read-only credential,
 * deliberately separate from the DiviGo OAuth app secret (least privilege — a leak here exposes only
 * wallet lookups, never the DiviGo money path). Requires the DB function public.app_wallets_by_email
 * (see docs/SOLANA_INTEGRATION_SETUP.md).
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Constant-time comparison — never leak secret length/prefix via early-exit timing.
function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function POST(request: Request) {
  const expected = process.env.LW_HOLDINGS_SECRET || ''
  const got = request.headers.get('x-lw-holdings-secret') || ''
  if (!expected || !got || !constEq(got, expected)) {
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
