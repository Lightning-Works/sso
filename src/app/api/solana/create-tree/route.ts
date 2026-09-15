/**
 * POST /api/solana/create-tree  — operator/one-time. Creates a Bubblegum Merkle
 * tree (one per game/collection) and records it in `cnft_trees`. Guarded by the
 * dedicated mint-service secret (header X-LW-Mint-Secret). This is a deliberate,
 * infrequent action (a tree is created once and reused for all of a collection's
 * mints), so it can also be run as a one-off script.
 *
 * Body: { maxDepth?, maxBufferSize?, canopyDepth?, name?, app? }
 *   ->  { treeAddress, signature }
 *
 * Requires SOLANA_MINT_AUTHORITY_SECRET (the tree/mint authority keypair) and
 * SOLANA_MINT_SERVICE_SECRET in the environment. Node runtime (Metaplex SDK).
 */
import { NextResponse } from 'next/server'
import { createCollectionTree } from '@/lib/solana/mint'
import { hasMintSecret, svc } from '@/lib/solana/routeHelpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!hasMintSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    maxDepth?: number
    maxBufferSize?: number
    canopyDepth?: number
    name?: string
    app?: string
  }

  let result
  try {
    result = await createCollectionTree({
      maxDepth: body.maxDepth,
      maxBufferSize: body.maxBufferSize,
      canopyDepth: body.canopyDepth,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'tree creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Record the tree. Best-effort: the tree already exists on-chain (the source of
  // truth), so a DB hiccup must not fail the response.
  let recorded = true
  try {
    const { error } = await svc()
      .from('cnft_trees')
      .insert({
        tree_address: result.treeAddress,
        app: body.app ?? '',
        name: body.name ?? '',
        max_depth: body.maxDepth ?? 14,
        max_buffer_size: body.maxBufferSize ?? 64,
        canopy_depth: body.canopyDepth ?? Math.max(0, (body.maxDepth ?? 14) - 5),
        create_signature: result.signature,
      })
    if (error) recorded = false
  } catch {
    recorded = false
  }

  return NextResponse.json({
    treeAddress: result.treeAddress,
    signature: result.signature,
    recorded,
  })
}
