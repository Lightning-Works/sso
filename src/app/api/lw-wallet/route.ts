import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || ''

const CHAIN_ALCHEMY: Record<string, string> = {
  Polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  Ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  Base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
}

export async function POST(request: Request) {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const walletAddresses = body.addresses as string[]
  if (!walletAddresses || walletAddresses.length === 0) {
    return NextResponse.json({ contracts: [], nfts: {} })
  }

  const serviceDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Get all LW contracts
  const { data: allContracts } = await serviceDb
    .from('lw_nft_contracts')
    .select('id, chain, contract_address, collection_name, symbol, token_type, icon_url, nft_count')
    .order('collection_name')

  if (!allContracts) return NextResponse.json({ contracts: [], nfts: {} })

  const owned: Record<number, unknown[]> = {}
  const contractsWithNfts: unknown[] = []

  for (const contract of allContracts) {
    const alchemyUrl = CHAIN_ALCHEMY[contract.chain]
    const ownedTokenIds: Set<string> = new Set()

    if (alchemyUrl && ALCHEMY_KEY) {
      for (const addr of walletAddresses) {
        try {
          let pageKey = ''
          do {
            const params = new URLSearchParams({
              owner: addr,
              'contractAddresses[]': contract.contract_address,
              withMetadata: 'false',
              pageSize: '100',
            })
            if (pageKey) params.set('pageKey', pageKey)
            const res = await fetch(`${alchemyUrl}/getNFTsForOwner?${params}`, { signal: AbortSignal.timeout(10000) })
            if (!res.ok) break
            const data = await res.json()
            for (const nft of data.ownedNfts || []) {
              ownedTokenIds.add(nft.tokenId)
            }
            pageKey = data.pageKey || ''
          } while (pageKey)
        } catch { /* skip */ }
      }
    } else {
      // Fallback: match owner field in cache
      const lowerAddresses = walletAddresses.map(a => a.toLowerCase())
      const { data: ownerMatches } = await serviceDb
        .from('lw_nft_data')
        .select('token_id')
        .eq('contract_id', contract.id)
        .in('owner', lowerAddresses)
      if (ownerMatches) ownerMatches.forEach(m => ownedTokenIds.add(m.token_id))
    }

    if (ownedTokenIds.size === 0) continue

    // Fetch full data for owned tokens
    const tokenIdArray = [...ownedTokenIds]
    const allNfts: unknown[] = []
    for (let i = 0; i < tokenIdArray.length; i += 50) {
      const batch = tokenIdArray.slice(i, i + 50)
      const { data: nfts } = await serviceDb
        .from('lw_nft_data')
        .select('id, contract_id, token_id, name, description, image_url, animation_url, attributes, owner')
        .eq('contract_id', contract.id)
        .in('token_id', batch)
      if (nfts) allNfts.push(...nfts)
    }

    if (allNfts.length > 0) {
      owned[contract.id] = allNfts
      contractsWithNfts.push(contract)
    }
  }

  return NextResponse.json({ contracts: contractsWithNfts, nfts: owned })
}
