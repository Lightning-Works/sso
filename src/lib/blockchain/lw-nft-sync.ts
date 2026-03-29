/**
 * LightningWorks NFT contract sync logic.
 * Fetches all NFTs for a registered contract and stores in lw_nft_data.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { blockscoutFetch, SOLANA_RPC, ATOMIC_API, EVM_CHAINS, SKALE_CHAINS } from './rpc'

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  if (url.startsWith('Qm') || url.startsWith('bafy')) return `https://ipfs.io/ipfs/${url}`
  return url
}

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || ''

const ALCHEMY_NFT_CHAINS: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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

async function fetchEvmContractNfts(blockscoutApi: string, contractAddress: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let nextParams = ''
  let pages = 0

  do {
    const url = `${blockscoutApi}/tokens/${contractAddress}/instances?${nextParams}`
    const data = await blockscoutFetch(url)
    if (!data) break

    for (const item of (data.items || []) as Record<string, unknown>[]) {
      const meta = (item.metadata || {}) as Record<string, unknown>
      nfts.push({
        token_id: item.id || '',
        name: meta.name || `#${item.id || '?'}`,
        description: meta.description || null,
        image_url: (item.image_url || meta.image || null) as string | null,
        animation_url: (meta.animation_url || null) as string | null,
        attributes: meta.attributes || [],
        owner: ((item.owner as Record<string, unknown>)?.hash || null) as string | null,
      })
    }

    const np = data.next_page_params as Record<string, string> | undefined
    nextParams = np ? `unique_token=${np.unique_token}` : ''
    pages++
  } while (nextParams && pages < 50)

  return nfts
}

// Alchemy fallback for EVM chains where Blockscout has incomplete indexing
async function fetchAlchemyContractNfts(alchemyNftUrl: string, contractAddress: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let startToken = ''
  let pages = 0

  do {
    const params = new URLSearchParams({
      contractAddress,
      withMetadata: 'true',
      limit: '100',
    })
    if (startToken) params.set('startToken', startToken)

    try {
      const res = await fetch(`${alchemyNftUrl}/getNFTsForContract?${params}`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) break
      const data = await res.json()
      const items = data.nfts || []
      if (items.length === 0) break

      for (const nft of items) {
        const meta = nft.raw?.metadata || {}
        nfts.push({
          token_id: nft.tokenId || '',
          name: nft.name || meta.name || `#${nft.tokenId || '?'}`,
          description: nft.description || meta.description || null,
          image_url: nft.image?.cachedUrl || nft.image?.originalUrl || meta.image || null,
          animation_url: meta.animation_url || null,
          attributes: meta.attributes || [],
          owner: null, // getNFTsForContract doesn't return owner
        })
      }

      startToken = data.pageKey || ''
      pages++
    } catch { break }
  } while (startToken && pages < 50)

  return nfts
}

async function fetchWaxCollectionNfts(collectionName: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let page = 1

  do {
    const res = await fetch(`${ATOMIC_API}/atomicassets/v1/assets?collection_name=${collectionName}&page=${page}&limit=100&order=asc&sort=asset_id`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) break
    const json = await res.json()
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) break

    for (const asset of json.data) {
      const d = (asset.data || asset.immutable_data || {}) as Record<string, unknown>
      const template = (asset.template || {}) as Record<string, unknown>
      const td = (template.immutable_data || {}) as Record<string, unknown>
      nfts.push({
        token_id: asset.asset_id,
        name: d.name || td.name || 'Unnamed',
        description: d.description || td.description || null,
        image_url: d.img || d.image || td.img || td.image || null,
        animation_url: d.video || td.video || null,
        attributes: Object.entries(d).filter(([k]) => !['name','img','image','video','description'].includes(k)).map(([k,v]) => ({ trait_type: k, value: v })),
        owner: asset.owner || null,
        schema: (asset.schema as Record<string,unknown>)?.schema_name || null,
        template_id: template.template_id || null,
        mint_number: asset.template_mint || null,
      })
    }

    if (json.data.length < 100) break
    page++
  } while (page <= 50)

  return nfts
}

async function fetchSolanaCollectionNfts(collectionAddress: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let page = 1

  do {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByGroup',
        params: { groupKey: 'collection', groupValue: collectionAddress, page, limit: 100 },
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) break
    const data = await res.json()
    const items = data.result?.items || []
    if (items.length === 0) break

    for (const item of items) {
      const content = item.content || {}
      const meta = content.metadata || {}
      const links = content.links || {}
      nfts.push({
        token_id: item.id,
        name: meta.name || `NFT ${item.id.slice(0, 8)}`,
        description: meta.description || null,
        image_url: links.image || meta.image || null,
        animation_url: links.animation_url || null,
        attributes: meta.attributes || [],
        owner: item.ownership?.owner || null,
        compressed: item.compression?.compressed || false,
      })
    }

    if (items.length < 100) break
    page++
  } while (page <= 50)

  return nfts
}

export async function syncContract(contractId: number): Promise<{ nft_count: number }> {
  const supabase = getServiceSupabase()

  const { data: contract } = await supabase
    .from('lw_nft_contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  if (!contract) throw new Error('Contract not found')

  let nfts: Record<string, unknown>[] = []
  const chain = contract.chain as string

  if (chain === 'WAX') {
    nfts = await fetchWaxCollectionNfts(contract.contract_address)
  } else if (chain === 'Solana' || chain.includes('Solana')) {
    nfts = await fetchSolanaCollectionNfts(contract.contract_address)
  } else {
    // EVM: try Blockscout first, fall back to Alchemy if incomplete
    const blockscoutApi = getBlockscoutApi(chain)
    if (blockscoutApi) {
      nfts = await fetchEvmContractNfts(blockscoutApi, contract.contract_address)
    }

    // If Blockscout returned very few results, try Alchemy as fallback
    const chainKey = chain.toLowerCase().replace(/\s+/g, '')
    const alchemyUrl = ALCHEMY_NFT_CHAINS[chainKey]
    if (nfts.length < 10 && alchemyUrl && ALCHEMY_KEY) {
      const alchemyNfts = await fetchAlchemyContractNfts(alchemyUrl, contract.contract_address)
      if (alchemyNfts.length > nfts.length) {
        nfts = alchemyNfts
      }
    }

    if (nfts.length === 0 && !blockscoutApi && !alchemyUrl) {
      throw new Error(`No API available for chain: ${chain}`)
    }
  }

  // Clear old data
  await supabase.from('lw_nft_data').delete().eq('contract_id', contractId)

  // Insert in batches
  if (nfts.length > 0) {
    const rows = nfts.map(n => ({
      contract_id: contractId,
      token_id: String(n.token_id || ''),
      name: String(n.name || ''),
      description: (n.description || null) as string | null,
      image_url: normalizeUrl(n.image_url as string | null),
      animation_url: normalizeUrl(n.animation_url as string | null),
      attributes: n.attributes || [],
      owner: (n.owner || null) as string | null,
      extra_data: n,
    }))

    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('lw_nft_data').insert(rows.slice(i, i + 50))
      if (error) throw new Error(`Batch insert failed at ${i}: ${error.message}`)
    }
  }

  // Update contract metadata
  await supabase
    .from('lw_nft_contracts')
    .update({ last_synced: new Date().toISOString(), nft_count: nfts.length })
    .eq('id', contractId)

  return { nft_count: nfts.length }
}
