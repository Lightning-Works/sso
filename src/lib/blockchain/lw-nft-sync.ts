/**
 * LightningWorks NFT contract sync logic.
 * Primary: reads tokenURI from contract via free RPC, fetches metadata directly.
 * Fallback: Alchemy getNFTsForContract for token ID enumeration.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { blockscoutFetch, rpcCall, SOLANA_RPC, ATOMIC_API, EVM_CHAINS, SKALE_CHAINS } from './rpc'

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

// ── Fetch NFTs with metadata from Alchemy (fast, bulk) ──

async function fetchAlchemyNftsWithMetadata(alchemyNftUrl: string, contractAddress: string, burnedIds: Set<string>): Promise<Record<string, unknown>[]> {
  const nfts: Record<string, unknown>[] = []
  let startToken = ''
  let pages = 0

  do {
    const params = new URLSearchParams({ contractAddress, withMetadata: 'true', limit: '100' })
    if (startToken) params.set('startToken', startToken)
    try {
      const res = await fetch(`${alchemyNftUrl}/getNFTsForContract?${params}`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) break
      const data = await res.json()
      const items = data.nfts || []
      if (items.length === 0) break

      for (const nft of items) {
        if (burnedIds.has(nft.tokenId || '')) continue
        const meta = nft.raw?.metadata || {}
        // Use the live tokenURI image if it's from our server (not Alchemy cache)
        const tokenUri = nft.tokenUri || ''
        let imageUrl = meta.image || nft.image?.originalUrl || nft.image?.cachedUrl || null
        // Prefer our server's image over Alchemy's cache for LW contracts
        if (tokenUri.includes('lightningworks.io') || tokenUri.includes('nftdata.')) {
          imageUrl = meta.image || imageUrl
        }
        nfts.push({
          token_id: nft.tokenId || '',
          name: meta.name || nft.name || `#${nft.tokenId || '?'}`,
          description: meta.description || nft.description || null,
          image_url: normalizeUrl(imageUrl),
          animation_url: normalizeUrl(meta.animation_url || null),
          attributes: meta.attributes || [],
          owner: null,
        })
      }
      startToken = data.pageKey || ''
      pages++
    } catch { break }
  } while (startToken && pages < 100)

  return nfts
}

// ── EVM sync: Alchemy with metadata when available, RPC fallback ──

async function fetchEvmContractNfts(chain: string, contractAddress: string): Promise<Record<string, unknown>[]> {
  const rpcs = getChainRpcs(chain)
  const alchemyUrl = getAlchemyNftUrl(chain)

  // Get burned IDs first
  const burnedIds = await getBurnedIds(alchemyUrl, contractAddress)

  // Fast path: use Alchemy with metadata (handles burned filtering internally)
  if (alchemyUrl && ALCHEMY_KEY) {
    const nfts = await fetchAlchemyNftsWithMetadata(alchemyUrl, contractAddress, burnedIds)
    if (nfts.length > 0) return nfts
  }

  // Slow path: try Blockscout with full metadata (paginated)
  const blockscoutApi = getBlockscoutApi(chain)
  if (blockscoutApi) {
    const bsNfts: Record<string, unknown>[] = []
    let nextParams = ''
    let pages = 0
    do {
      const url = `${blockscoutApi}/tokens/${contractAddress}/instances?${nextParams}`
      const data = await blockscoutFetch(url)
      if (!data?.items) break
      for (const item of data.items as Record<string, unknown>[]) {
        const tokenId = String(item.id || '')
        if (burnedIds.has(tokenId)) continue
        const meta = (item.metadata || {}) as Record<string, unknown>
        bsNfts.push({
          token_id: tokenId,
          name: meta.name || `#${tokenId}`,
          description: meta.description || null,
          image_url: normalizeUrl((item.image_url || meta.image || null) as string | null),
          animation_url: normalizeUrl((meta.animation_url || null) as string | null),
          attributes: meta.attributes || [],
          owner: ((item.owner as Record<string, unknown>)?.hash || null) as string | null,
        })
      }
      const np = data.next_page_params as Record<string, string> | undefined
      nextParams = np ? `unique_token=${np.unique_token}` : ''
      pages++
    } while (nextParams && pages < 100)

    if (bsNfts.length > 0) return bsNfts
  }

  // Fallback: enumerate token IDs via RPC
  let tokenIds: string[] = []

  // Fallback: enumerate by totalSupply via RPC
  if (tokenIds.length === 0 && rpcs.length > 0) {
    const supplyResult = await rpcCall(rpcs, 'eth_call', [{ to: contractAddress, data: '0x18160ddd' }, 'latest'])
    if (supplyResult?.result) {
      const totalSupply = parseInt(supplyResult.result as string, 16)
      if (totalSupply > 0 && totalSupply <= 50000) {
        for (let i = 1; i <= totalSupply; i++) tokenIds.push(String(i))
      }
    }
  }

  if (tokenIds.length === 0) return []

  // For chains without Alchemy burned detection, check via RPC
  if (burnedIds.size === 0 && rpcs.length > 0) {
    const BURN_CHECK_BATCH = 50
    for (let i = 0; i < tokenIds.length; i += BURN_CHECK_BATCH) {
      const batch = tokenIds.slice(i, i + BURN_CHECK_BATCH)
      await Promise.all(batch.map(async (id) => {
        const data = '0x6352211e' + parseInt(id, 10).toString(16).padStart(64, '0')
        const result = await rpcCall(rpcs, 'eth_call', [{ to: contractAddress, data }, 'latest'])
        if (result?.result) {
          const owner = '0x' + (result.result as string).slice(-40)
          if (owner === '0x0000000000000000000000000000000000000000') burnedIds.add(id)
        } else {
          burnedIds.add(id)
        }
      }))
    }
  }
  const liveIds = tokenIds.filter(id => !burnedIds.has(id))

  // Fetch metadata from tokenURI via free RPC
  const nfts: Record<string, unknown>[] = []
  const BATCH = 20

  for (let i = 0; i < liveIds.length; i += BATCH) {
    const batch = liveIds.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (tokenId) => {
      const uri = await fetchTokenUri(rpcs, contractAddress, parseInt(tokenId, 10))
      if (!uri) return null
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
    for (const r of results) if (r) nfts.push(r)
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

  // Upsert instead of delete+insert — only updates changed data, skips existing
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
      const { error } = await supabase
        .from('lw_nft_data')
        .upsert(rows.slice(i, i + 50), { onConflict: 'contract_id,token_id' })
      if (error) throw new Error(`Batch upsert failed at ${i}: ${error.message}`)
    }
  }

  // Remove tokens that no longer exist (burned since last sync)
  const liveTokenIds = new Set(nfts.map(n => String(n.token_id || '')))
  const { data: existing } = await supabase
    .from('lw_nft_data')
    .select('id, token_id')
    .eq('contract_id', contractId)
  if (existing) {
    const toDelete = existing.filter(e => !liveTokenIds.has(e.token_id)).map(e => e.id)
    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += 50) {
        await supabase.from('lw_nft_data').delete().in('id', toDelete.slice(i, i + 50))
      }
    }
  }

  await supabase
    .from('lw_nft_contracts')
    .update({ last_synced: new Date().toISOString(), nft_count: nfts.length })
    .eq('id', contractId)

  return { nft_count: nfts.length }
}

// ── Chunked sync for large collections ──

export async function syncContractChunk(
  contractId: number,
  chunk: number,
  chunkSize: number = 500,
): Promise<{ nft_count: number; total_ids: number; chunk: number; done: boolean }> {
  const supabase = getServiceSupabase()

  const { data: contract } = await supabase.from('lw_nft_contracts').select('*').eq('id', contractId).single()
  if (!contract) throw new Error('Contract not found')

  const chain = contract.chain as string

  // Non-EVM: use full sync (WAX/Solana are fast enough)
  if (chain === 'WAX' || chain === 'Solana' || chain.includes('Solana')) {
    const result = await syncContract(contractId)
    return { ...result, total_ids: result.nft_count, chunk: 0, done: true }
  }

  const rpcs = getChainRpcs(chain)
  const alchemyUrl = getAlchemyNftUrl(chain)

  // On first chunk, get all token IDs and store them
  if (chunk === 0) {
    // Clear old data
    await supabase.from('lw_nft_data').delete().eq('contract_id', contractId)
  }

  // Get all token IDs (same fallback chain as fetchEvmContractNfts)
  let tokenIds = await getTokenIds(alchemyUrl, contract.contract_address)

  if (tokenIds.length === 0) {
    const blockscoutApi = getBlockscoutApi(chain)
    if (blockscoutApi) {
      const data = await blockscoutFetch(`${blockscoutApi}/tokens/${contract.contract_address}/instances`)
      if (data?.items) tokenIds = (data.items as { id: string }[]).map(i => i.id)
    }
  }

  if (tokenIds.length === 0 && rpcs.length > 0) {
    const supplyResult = await rpcCall(rpcs, 'eth_call', [{ to: contract.contract_address, data: '0x18160ddd' }, 'latest'])
    if (supplyResult?.result) {
      const totalSupply = parseInt(supplyResult.result as string, 16)
      if (totalSupply > 0 && totalSupply <= 50000) {
        for (let i = 1; i <= totalSupply; i++) tokenIds.push(String(i))
      }
    }
  }

  if (tokenIds.length === 0) return { nft_count: 0, total_ids: 0, chunk, done: true }

  // Filter burned
  const burnedIds = await getBurnedIds(alchemyUrl, contract.contract_address)
  const liveIds = tokenIds.filter(id => !burnedIds.has(id))

  // Get this chunk's slice
  const start = chunk * chunkSize
  const end = start + chunkSize
  const chunkIds = liveIds.slice(start, end)
  const isDone = end >= liveIds.length

  if (chunkIds.length === 0) {
    await supabase.from('lw_nft_contracts').update({ last_synced: new Date().toISOString(), nft_count: liveIds.length }).eq('id', contractId)
    return { nft_count: 0, total_ids: liveIds.length, chunk, done: true }
  }

  // Fetch metadata for this chunk
  const nfts: Record<string, unknown>[] = []
  const BATCH = 20

  for (let i = 0; i < chunkIds.length; i += BATCH) {
    const batch = chunkIds.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (tokenId) => {
      const uri = await fetchTokenUri(rpcs, contract.contract_address, parseInt(tokenId, 10))
      if (!uri) return null
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
    for (const r of results) if (r) nfts.push(r)
  }

  // Insert this chunk
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
      if (error) throw new Error(`Batch insert failed: ${error.message}`)
    }
  }

  // Update contract
  const { count: totalCached } = await supabase.from('lw_nft_data').select('id', { count: 'exact', head: true }).eq('contract_id', contractId)
  await supabase.from('lw_nft_contracts').update({
    last_synced: new Date().toISOString(),
    nft_count: totalCached || nfts.length,
  }).eq('id', contractId)

  return { nft_count: nfts.length, total_ids: liveIds.length, chunk, done: isDone }
}
