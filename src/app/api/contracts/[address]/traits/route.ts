import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// GET /api/contracts/:address/traits?chain=evm&evm_chain=polygon
// Returns all known trait types and values for a contract
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const { searchParams } = new URL(request.url)
  const chain = searchParams.get('chain') || 'evm'
  const evmChain = searchParams.get('evm_chain') || 'polygon'

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // First check if this is a registered LW contract
  const { data: contract } = await db
    .from('lw_nft_contracts')
    .select('id')
    .eq('contract_address', address)
    .limit(1)
    .single()

  if (contract) {
    // Get traits from cached lw_nft_data
    const { data: nfts } = await db
      .from('lw_nft_data')
      .select('attributes')
      .eq('contract_id', contract.id)
      .limit(500)

    const traitMap: Record<string, Set<string>> = {}
    for (const nft of nfts || []) {
      const attrs = (nft.attributes || []) as { trait_type?: string; value?: unknown }[]
      for (const a of attrs) {
        if (!a.trait_type) continue
        if (!traitMap[a.trait_type]) traitMap[a.trait_type] = new Set()
        if (a.value !== undefined && a.value !== null) traitMap[a.trait_type].add(String(a.value))
      }
    }

    const traits = Object.entries(traitMap).map(([trait_type, values]) => ({
      trait_type,
      values: [...values].sort(),
    }))

    return NextResponse.json({ traits, source: 'lightningworks' }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  // External contract — try Alchemy
  const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || ''
  const alchemyChains: Record<string, string> = {
    ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  }
  const alchemyUrl = alchemyChains[evmChain]

  if (!alchemyUrl || !ALCHEMY_KEY) {
    return NextResponse.json({ traits: [], source: 'none', error: 'Chain not supported for external contracts' }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Fetch a sample of NFTs to discover traits
  try {
    const res = await fetch(`${alchemyUrl}/getNFTsForContract?contractAddress=${address}&withMetadata=true&limit=100`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return NextResponse.json({ traits: [], source: 'alchemy', error: 'Failed to fetch' })

    const data = await res.json()
    const traitMap: Record<string, Set<string>> = {}
    for (const nft of data.nfts || []) {
      const attrs = nft.raw?.metadata?.attributes || []
      for (const a of attrs as { trait_type?: string; value?: unknown }[]) {
        if (!a.trait_type) continue
        if (!traitMap[a.trait_type]) traitMap[a.trait_type] = new Set()
        if (a.value !== undefined && a.value !== null) traitMap[a.trait_type].add(String(a.value))
      }
    }

    const traits = Object.entries(traitMap).map(([trait_type, values]) => ({
      trait_type,
      values: [...values].sort(),
    }))

    return NextResponse.json({ traits, source: 'alchemy', sample_size: (data.nfts || []).length }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch {
    return NextResponse.json({ traits: [], source: 'error' }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  })
}
