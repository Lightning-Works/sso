/**
 * GET /api/nft-lookup?contract=0x...&chain=ethereum
 *
 * Resolve an NFT smart contract to its collection NAME (+ symbol/icon/type) from the LW contract
 * registry (lw_nft_contracts). Used by game clients (Dreadroot) so that when an admin enters an NFT
 * contract for token-gating, the name fills in automatically. Public read, CORS-enabled. EVM
 * addresses are matched case-insensitively. Returns {found:false} if the contract isn't registered.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const CORS = { 'Access-Control-Allow-Origin': '*' }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const contract = (searchParams.get('contract') || '').trim()
  const chain = (searchParams.get('chain') || '').trim().toLowerCase()
  if (!contract) return NextResponse.json({ error: 'contract required' }, { status: 400, headers: CORS })

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db
    .from('lw_nft_contracts')
    .select('chain, contract_address, collection_name, symbol, token_type, icon_url')
    .ilike('contract_address', contract)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })

  const rows = data || []
  // If a chain was given, prefer the row whose (normalized) chain matches; else take the first.
  const match = (chain
    ? rows.find(r => String(r.chain).toLowerCase().replace(/\s+/g, '') === chain)
    : null) || rows[0]

  return NextResponse.json({
    found: !!match,
    name: match?.collection_name ?? null,
    symbol: match?.symbol ?? null,
    chain: match?.chain ?? null,
    token_type: match?.token_type ?? null,
    icon_url: match?.icon_url ?? null,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
}
