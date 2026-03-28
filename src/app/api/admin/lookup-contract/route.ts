import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { EVM_CHAINS, SKALE_CHAINS, blockscoutFetch, ATOMIC_API, SOLANA_RPC } from '@/lib/blockchain/rpc'

function getBlockscoutApi(chain: string): string | null {
  const key = chain.toLowerCase().replace(/\s+/g, '')
  for (const [k, v] of Object.entries(EVM_CHAINS)) {
    if (k === key || v.name.toLowerCase().replace(/\s+/g, '') === key) return v.blockscoutApi || null
  }
  for (const [k, v] of Object.entries(SKALE_CHAINS)) {
    if (v.name.toLowerCase().replace(/\s+/g, '') === key || `skale${k}` === key) return v.blockscoutApi
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await request.json()
  const chain = body.chain as string
  const address = body.address as string

  if (!chain || !address) {
    return NextResponse.json({ error: 'chain and address required' }, { status: 400 })
  }

  try {
    if (chain === 'WAX') {
      // WAX: address is the collection name, look up via AtomicAssets
      const res = await fetch(`${ATOMIC_API}/atomicassets/v1/collections/${address}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return NextResponse.json({ error: 'Collection not found on WAX' }, { status: 404 })
      const data = await res.json()
      const col = data.data || {}
      return NextResponse.json({
        collection_name: col.name || col.collection_name || address,
        symbol: '',
        token_type: 'AtomicAssets',
        total_supply: null,
        description: col.data?.description || '',
        image_url: col.img ? `https://ipfs.io/ipfs/${col.img}` : null,
      })
    }

    if (chain === 'Solana' || chain.includes('Solana')) {
      // Solana: look up collection via Helius
      const res = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getAsset',
          params: { id: address },
        }),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json()
      const asset = data.result || {}
      const meta = asset.content?.metadata || {}
      return NextResponse.json({
        collection_name: meta.name || meta.symbol || address.slice(0, 12),
        symbol: meta.symbol || '',
        token_type: asset.compression?.compressed ? 'cNFT' : 'Metaplex',
        total_supply: null,
        description: meta.description || '',
      })
    }

    // EVM chains — use Blockscout
    const blockscoutApi = getBlockscoutApi(chain)
    if (!blockscoutApi) {
      return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 })
    }

    const data = await blockscoutFetch(`${blockscoutApi}/tokens/${address}`)
    if (!data) return NextResponse.json({ error: 'Contract not found on this chain. Check the address and chain selection.' }, { status: 404 })

    // Also get instance count
    const instances = await blockscoutFetch(`${blockscoutApi}/tokens/${address}/instances`)
    const instanceCount = (instances?.items as unknown[] || []).length

    return NextResponse.json({
      collection_name: (data.name || '') as string,
      symbol: (data.symbol || '') as string,
      token_type: (data.type || 'ERC-721') as string,
      total_supply: data.total_supply ? parseInt(String(data.total_supply)) : null,
      holders_count: (data.holders_count || '0') as string,
      instance_count: instanceCount,
      description: '',
      icon_url: (data.icon_url || null) as string | null,
    })
  } catch (e) {
    return NextResponse.json({ error: `Lookup failed: ${(e as Error).message}` }, { status: 502 })
  }
}
