import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// GET /api/contracts — List all registered LW smart contracts
export async function GET() {
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await db
    .from('lw_nft_contracts')
    .select('id, chain, contract_address, collection_name, symbol, token_type, icon_url')
    .order('collection_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    contracts: (data || []).map(c => ({
      id: c.id,
      chain: c.chain,
      evm_chain: c.chain.toLowerCase().replace(/\s+/g, ''),
      collection_name: c.collection_name,
      symbol: c.symbol,
      contract_address: c.contract_address,
      icon_url: c.icon_url,
    })),
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  })
}
