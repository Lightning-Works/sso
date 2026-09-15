/**
 * POST /api/solana/build-cnft-transfer  — server-to-server (header X-LW-Mint-Secret).
 * Builds an UNSIGNED cNFT transfer transaction for DiviGo to sign with the user's
 * custodial key and broadcast. SSO holds NO user key and never signs here.
 *
 * Body: { assetId, from, to, feePayer? }  ->  { transaction (base64), assetId, from, to, feePayer }
 *   `from` = current owner (the user's custodial pubkey); `to` = recipient.
 *   `feePayer` optional (defaults to `from`); pass a treasury pubkey to have the
 *   treasury front the fee (DiviGo then signs with both keys).
 *
 * Needs no mint-authority key (build-only). Node runtime (Metaplex SDK).
 * Proven on devnet 2026-09-15.
 */
import { NextResponse } from 'next/server'
import { buildCnftTransfer } from '@/lib/solana/transfer'
import { hasMintSecret } from '@/lib/solana/routeHelpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!hasMintSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    assetId?: string
    from?: string
    to?: string
    feePayer?: string
  }

  const assetId = (body.assetId || '').trim()
  const from = (body.from || '').trim()
  const to = (body.to || '').trim()
  if (!assetId || !from || !to) {
    return NextResponse.json({ error: 'assetId, from and to are required' }, { status: 400 })
  }

  try {
    const result = await buildCnftTransfer({
      assetId,
      from,
      to,
      feePayer: body.feePayer?.trim() || undefined,
    })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'build transfer failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
