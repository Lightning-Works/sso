/**
 * LightningWorks NFT contract sync logic.
 * Primary: reads tokenURI from contract via free RPC, fetches metadata directly.
 * Fallback: Alchemy getNFTsForContract for token ID enumeration.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { blockscoutFetch, SOLANA_RPC, ATOMIC_API, EVM_CHAINS, SKALE_CHAINS } from './rpc'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || ''
const ALCHEMY_NFT_CHAINS: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
}

function getServiceSupabase() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  if (url.startsWith('Qm') || url.startsWith('bafy')) return `https://ipfs.io/ipfs/${url}`
  return url
}

function getChainRpcs(chain: string): string[] {
  const key = chain.toLowerCase().replace(/\s+/g, '')
  for (const [k, v] of Object.entries(EVM_CHAINS)) {
    if (k === key || v.name.toLowerCase().replace(/\s+/g, '') === key) return v.rpcs
  }
  for (const [k, v] of Object.entries(SKALE_CHAINS)) {
    if (v.name.toLowerCase().replace(/\s+/g, '') === key) return [v.blockscoutApi.replace('/api/v2', '')]
  }
  return []
}

function getBlockscoutApi(chain: string): string | null {
  const key = chain.toLowerCase().replace(/\s+/g, '')
  for (const [k, v] of Object.entries(EVM_CHAINS)) {
    if (k === key || v.name.toLowerCase().replace(/\s+/g, '') === key) return v.blockscoutApi || null
  }
  for (const [k, v] of Object.entries(SKALE_CHAINS)) {
    if (v.name.toLowerCase().replace(/\s+/g, '') === key) return v.blockscoutApi
  }
  return null
}

function getAlchemyNftUrl(chain: string): string | null {
  const key = chain.toLowerCase().replace(/\s+/g, '')
  return ALCHEMY_NFT_CHAINS[key] || null
}

// ── Fetch tokenURI from contract via free RPC ──

async function fetchTokenUri(rpcs: string[], contractAddress: string, tokenId: number): Promise<string | null> {
  const data = '0xc87b56dd' + tokenId.toString(16).padStart(64, '0')
  for (const rpc of rpcs) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contractAddress, data }, 'latest'] }),
        signal: AbortSignal.timeout(5000),
      })
      const result = await res.json()
      const r = result.result
      if (!r || r === '0x' || r.length < 130) continue
      const offset = parseInt(r.slice(2, 66), 16)
      const length = parseInt(r.slice(66, 130), 16)
      if (length === 0 || length > 100000) continue
      return Buffer.from(r.slice(130, 130 + length * 2), 'hex').toString('utf8')
    } catch { continue }
  }
  return null
}

// ── Fetch metadata from a tokenURI ──

async function fetchMetadata(uri: string): Promise<Record<string, unknown> | null> {
  try {
    // Handle data URIs (on-chain base64)
    if (uri.startsWith('data:application/json;base64,')) {
      const json = Buffer.from(uri.slice(29), 'base64').toString('utf8')
      return JSON.parse(json)
    }
    if (uri.startsWith('data:application/json,')) {
      return JSON.parse(decodeURIComponent(uri.slice(22)))
    }

    // Normalize IPFS
    const url = normalizeUrl(uri)
    if (!url) return null

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ── Get all token IDs for an EVM contract ──

async function getTokenIds(alchemyNftUrl: string | null, contractAddress: string): Promise<string[]> {
  if (!alchemyNftUrl || !ALCHEMY_KEY) return []
  const ids: string[] = []
  let startToken = ''
  let pages = 0

  do {
    const params = new URLSearchParams({ contractAddress, withMetadata: 'false', limit: '100' })
    if (startToken) params.set('startToken', startToken)
    try {
      const res = await fetch(`${alchemyNftUrl}/getNFTsForContract?${params}`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) break
      const data = await res.json()
      const nfts = data.nfts || []
      if (nfts.length === 0) break
      for (const nft of nfts) ids.push(nft.tokenId)
      startToken = data.pageKey || ''
      pages++
    } catch { break }
  } while (startToken && pages < 100)

  return ids
}

// ── Get burned token IDs ──

async function getBurnedIds(alchemyNftUrl: string | null, contractAddress: string): Promise<Set<string>> {
  const burned = new Set<string>()
  if (!alchemyNftUrl || !ALCHEMY_KEY) return burned
  try {
    const res = await fetch(`${alchemyNftUrl}/getOwnersForContract?contractAddress=${contractAddress}&withTokenBalances=true`, {
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return burned
    const data = await res.json()
    for (const owner of data.owners || []) {
      if (owner.ownerAddress === '0x0000000000000000000000000000000000000000') {
        for (const tb of owner.tokenBalances || []) burned.add(tb.tokenId || '')
      }
    }
  } catch { /* skip */ }
  return burned
}

// ── EVM sync: free RPC primary, Alchemy for token ID enumeration ──

async function fetchEvmContractNfts(chain: string, contractAddress: string): Promise<Record<string, unknown>[]> {
  const rpcs = getChainRpcs(chain)
  const alchemyUrl = getAlchemyNftUrl(chain)

  // Step 1: Get all token IDs from Alchemy (lightweight, no metadata)
  let tokenIds = await getTokenIds(alchemyUrl, contractAddress)

  // Fallback: try Blockscout if Alchemy unavailable
  if (tokenIds.length === 0) {
    const blockscoutApi = getBlockscoutApi(chain)
    if (blockscoutApi) {
      const data = await blockscoutFetch(`${blockscoutApi}/tokens/${contractAddress}/instances`)
      if (data?.items) {
        tokenIds = (data.items as { id: string }[]).map(i => i.id)
      }
    }
  }

  if (tokenIds.length === 0) return []

  // Step 2: Get burned IDs and filter
  const burnedIds = await getBurnedIds(alchemyUrl, contractAddress)
  const liveIds = tokenIds.filter(id => !burnedIds.has(id))

  // Step 3: Fetch metadata from tokenURI via free RPC (batched)
  const nfts: Record<string, unknown>[] = []
  const BATCH = 20

  for (let i = 0; i < liveIds.length; i += BATCH) {
    const batch = liveIds.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (tokenId) => {
      // Get tokenURI from contract
      const uri = await fetchTokenUri(rpcs, contractAddress, parseInt(tokenId, 10))
      if (!uri) return null

      // Fetch metadata from URI
      const meta = await fetchMetadata(uri)
      if (!meta) return null

      return {
        token_id: tokenId,
        name: meta.name || `#${tokenId}`,
        description: meta.description || null,
        image_url: normalizeUrl(meta.image as string | null),
        animation_url: normalizeUrl(meta.animation_url as string | null),
        attributes: meta.attributes || [],
        owner: null,
      }
    }))

    for (const r of results) {
      if (r) nfts.push(r)
    }
  }

  return nfts
}

// ── WAX sync ──

async function fetchWaxCollectionNfts(collectionName: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let page = 1
  do {
    try {
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
          image_url: normalizeUrl((d.img || d.image || td.img || td.image || null) as string | null),
          animation_url: normalizeUrl((d.video || td.video || null) as string | null),
          attributes: Object.entries(d).filter(([k]) => !['name','img','image','video','description'].includes(k)).map(([k,v]) => ({ trait_type: k, value: v })),
          owner: asset.owner || null,
        })
      }
      if (json.data.length < 100) break
      page++
    } catch { break }
  } while (page <= 100)
  return nfts
}

// ── Solana sync ──

async function fetchSolanaCollectionNfts(collectionAddress: string): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let page = 1
  do {
    try {
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
          image_url: normalizeUrl(links.image || meta.image || null),
          animation_url: normalizeUrl(links.animation_url || null),
          attributes: meta.attributes || [],
          owner: item.ownership?.owner || null,
        })
      }
      if (items.length < 100) break
      page++
    } catch { break }
  } while (page <= 100)
  return nfts
}

// ── Main sync function ──

export async function syncContract(contractId: number): Promise<{ nft_count: number }> {
  const supabase = getServiceSupabase()

  const { data: contract } = await supabase.from('lw_nft_contracts').select('*').eq('id', contractId).single()
  if (!contract) throw new Error('Contract not found')

  let nfts: Record<string, unknown>[] = []
  const chain = contract.chain as string

  if (chain === 'WAX') {
    nfts = await fetchWaxCollectionNfts(contract.contract_address)
  } else if (chain === 'Solana' || chain.includes('Solana')) {
    nfts = await fetchSolanaCollectionNfts(contract.contract_address)
  } else {
    nfts = await fetchEvmContractNfts(chain, contract.contract_address)
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
      image_url: (n.image_url || null) as string | null,
      animation_url: (n.animation_url || null) as string | null,
      attributes: n.attributes || [],
      owner: (n.owner || null) as string | null,
      extra_data: n,
    }))

    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('lw_nft_data').insert(rows.slice(i, i + 50))
      if (error) throw new Error(`Batch insert failed at ${i}: ${error.message}`)
    }
  }

  await supabase
    .from('lw_nft_contracts')
    .update({ last_synced: new Date().toISOString(), nft_count: nfts.length })
    .eq('id', contractId)

  return { nft_count: nfts.length }
}
