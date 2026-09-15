// Shared helpers for the Solana cNFT API routes: constant-time secret check and a
// service-role Supabase client. Mirrors the auth pattern in
// src/app/api/app/connected-wallets/route.ts, but with a DEDICATED secret
// (SOLANA_MINT_SERVICE_SECRET, header X-LW-Mint-Secret) so the mint/transfer path
// is least-privilege and separate from the read-only holdings secret.
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Constant-time comparison — never leak secret length/prefix via early-exit timing.
export function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// True only if the request carries the correct X-LW-Mint-Secret header.
export function hasMintSecret(request: Request): boolean {
  const expected = process.env.SOLANA_MINT_SERVICE_SECRET || ''
  const got = request.headers.get('x-lw-mint-secret') || ''
  return !!expected && !!got && constEq(got, expected)
}

export function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
