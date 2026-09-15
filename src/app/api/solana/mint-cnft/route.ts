/**
 * POST /api/solana/mint-cnft  — server-to-server (header X-LW-Mint-Secret). Mints a
 * reward compressed NFT into a game/collection tree, owned by the recipient, and
 * records it in `cnft_mints`. The on-chain tx signature is the verifiable proof.
 *
 * Body: { treeAddress, to, name, uri, sellerFeeBasisPoints?, app?, userRef? }
 *   `to` = the recipient Solana pubkey. (In v1 the caller resolves the recipient;
 *   auto-resolving an SSO user -> divigo_links -> DiviGo deposit-address is a later
 *   step, once DiviGo exposes that endpoint. See DIVIGO-SSO-CNFT-PLAN.md.)
 *   ->  { assetId, signature }
 *
 * Requires SOLANA_MINT_AUTHORITY_SECRET + SOLANA_MINT_SERVICE_SECRET. Node runtime.
 */
import { NextResponse } from 'next/server'
import { mintCnft } from '@/lib/solana/mint'
import { hasMintSecret, svc } from '@/lib/solana/routeHelpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!hasMintSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    treeAddress?: string
    to?: string
    name?: string
    uri?: string
    sellerFeeBasisPoints?: number
    app?: string
    userRef?: string
  }

  const treeAddress = (body.treeAddress || '').trim()
  const to = (body.to || '').trim()
  const name = (body.name || '').trim()
  const uri = (body.uri || '').trim()
  if (!treeAddress || !to || !name || !uri) {
    return NextResponse.json(
      { error: 'treeAddress, to, name and uri are required' },
      { status: 400 }
    )
  }

  let result
  try {
    result = await mintCnft({
      treeAddress,
      recipient: to,
      name,
      uri,
      sellerFeeBasisPoints: body.sellerFeeBasisPoints,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'mint failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Best-effort record; the mint is already on-chain (source of truth).
  let recorded = true
  try {
    const { error } = await svc()
      .from('cnft_mints')
      .insert({
        asset_id: result.assetId,
        tree_address: treeAddress,
        recipient_address: to,
        name,
        uri,
        app: body.app ?? '',
        user_ref: body.userRef ?? '',
        tx_sig: result.signature,
        status: 'confirmed',
      })
    if (error) recorded = false
  } catch {
    recorded = false
  }

  return NextResponse.json({
    assetId: result.assetId,
    signature: result.signature,
    recorded,
  })
}
