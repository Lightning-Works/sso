import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY
const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
const WAX_RPC = 'https://wax.greymass.com'

// ── Helpers ──

async function getUserWallets(userId: string, chain?: string) {
  const supabase = await createClient()
  let query = supabase.from('connected_wallets').select('*').eq('user_id', userId)
  if (chain) query = query.eq('chain_type', chain)
  const { data } = await query
  return (data || []) as { chain_type: string; wallet_address: string; wallet_provider: string }[]
}

async function fetchEvmBalance(rpcUrl: string, contractAddress: string, walletAddress: string, decimals: number): Promise<number> {
  // ERC-20 balanceOf(address)
  const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contractAddress, data }, 'latest'] }),
  })
  const result = await res.json()
  if (!result.result || result.result === '0x') return 0
  return parseInt(result.result, 16) / Math.pow(10, decimals)
}

async function fetchEvmNativeBalance(rpcUrl: string, walletAddress: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [walletAddress, 'latest'] }),
  })
  const result = await res.json()
  if (!result.result) return 0
  return parseInt(result.result, 16) / 1e18
}

async function fetchSolanaBalance(mintAddress: string, walletAddress: string): Promise<number> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getTokenAccountsByOwner',
      params: [walletAddress, { mint: mintAddress }, { encoding: 'jsonParsed' }],
    }),
  })
  const data = await res.json()
  const accounts = data.result?.value || []
  let total = 0
  for (const acc of accounts) {
    total += parseFloat(acc.account.data.parsed.info.tokenAmount.uiAmountString || '0')
  }
  return total
}

async function fetchSolanaNativeBalance(walletAddress: string): Promise<number> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
  })
  const data = await res.json()
  return (data.result?.value || 0) / 1e9
}

async function fetchWaxBalance(account: string, contract: string, symbol: string): Promise<number> {
  const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: contract, account, symbol }),
  })
  const data = await res.json()
  if (Array.isArray(data) && data.length > 0) {
    return parseFloat(data[0].split(' ')[0])
  }
  return 0
}

async function fetchEvmNfts(rpcUrl: string, contractAddress: string, walletAddress: string): Promise<string[]> {
  // Use Alchemy getNFTsForOwner filtered by contract
  const params = new URLSearchParams({
    owner: walletAddress,
    'contractAddresses[]': contractAddress,
    withMetadata: 'true',
    pageSize: '100',
  })
  const res = await fetch(`${rpcUrl}/getNFTsForOwner?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.ownedNfts || []).map((n: Record<string, unknown>) => {
    const meta = (n.raw as Record<string, unknown>)?.metadata as Record<string, unknown> || {}
    return JSON.stringify({
      tokenId: n.tokenId,
      name: n.name || `#${n.tokenId}`,
      attributes: (meta.attributes || []) as Record<string, unknown>[],
    })
  })
}

async function fetchSolanaNfts(walletAddress: string, collectionAddress?: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getAssetsByOwner',
      params: { ownerAddress: walletAddress, page: 1, limit: 1000, displayOptions: { showCollectionMetadata: true } },
    }),
  })
  const data = await res.json()
  let items = (data.result?.items || []) as Record<string, unknown>[]
  // Filter fungible tokens
  items = items.filter((i: Record<string, unknown>) => i.interface !== 'FungibleToken' && i.interface !== 'FungibleAsset')
  // Filter by collection if specified
  if (collectionAddress) {
    items = items.filter((i: Record<string, unknown>) => {
      const groups = (i.grouping || []) as { group_key: string; group_value: string }[]
      return groups.some(g => g.group_key === 'collection' && g.group_value === collectionAddress)
    })
  }
  return items
}

async function fetchWaxNfts(account: string, collection: string, schema?: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    owner: account,
    collection_name: collection,
    limit: '1000',
  })
  if (schema) params.set('schema_name', schema)
  const res = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?${params}`)
  const data = await res.json()
  return data.data || []
}

// ── Default RPC URLs for common chains ──
const DEFAULT_RPC: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  bsc: 'https://bsc-dataseed.binance.org',
  arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  optimism: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
}

const DEFAULT_NFT_RPC: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
}

// ── Main Gate Endpoint ──

export async function POST(request: Request) {
  const supabase = await createClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.token as string | undefined
  const userId = body.user_id as string | undefined
  const username = body.username as string | undefined
  const rules = body.rules as GateRule[] | undefined

  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: 'rules array is required' }, { status: 400 })
  }

  // Resolve user
  let resolvedUserId: string | null = null

  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    resolvedUserId = user.id
  } else if (userId) {
    resolvedUserId = userId
  } else if (username) {
    const { data } = await supabase.from('profiles').select('id').eq('username', username).single()
    if (!data) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    resolvedUserId = data.id
  } else {
    return NextResponse.json({ error: 'token, user_id, or username is required' }, { status: 400 })
  }

  // Evaluate each rule
  const results: GateResult[] = []

  for (const rule of rules) {
    try {
      const result = await evaluateRule(resolvedUserId!, rule)
      results.push(result)
    } catch (e) {
      results.push({
        rule: rule.type,
        pass: false,
        detail: `Error: ${(e as Error).message}`,
      })
    }
  }

  const allPass = results.every(r => r.pass)

  return NextResponse.json({
    user_id: resolvedUserId,
    pass: allPass,
    results,
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// ── Types ──

interface GateRule {
  type: 'token_balance' | 'nft_ownership' | 'nft_trait' | 'nft_collection_count' | 'custom_token'
  chain?: 'evm' | 'solana' | 'wax'

  // For token_balance
  symbol?: string
  contract?: string
  min_balance?: number

  // For custom_token (any chain, any token)
  rpc_url?: string
  token_address?: string
  token_symbol?: string
  decimals?: number
  evm_chain?: string

  // For NFT rules
  collection?: string       // contract address (EVM), collection address (Solana), collection name (WAX)
  schema?: string           // WAX schema filter
  trait_type?: string        // attribute key to check
  trait_value?: string       // required attribute value
  min_count?: number         // minimum number of matching NFTs
}

interface GateResult {
  rule: string
  pass: boolean
  detail?: string
  balance?: number
  count?: number
}

// ── Rule Evaluator ──

async function evaluateRule(userId: string, rule: GateRule): Promise<GateResult> {
  const wallets = await getUserWallets(userId, rule.chain)

  switch (rule.type) {
    case 'token_balance': {
      if (!rule.symbol && !rule.contract) {
        return { rule: rule.type, pass: false, detail: 'symbol or contract required' }
      }
      const minBalance = rule.min_balance ?? 0

      let totalBalance = 0
      for (const w of wallets) {
        if (w.chain_type === 'evm' && rule.contract) {
          const rpcUrl = rule.rpc_url || DEFAULT_RPC[rule.evm_chain || 'ethereum'] || DEFAULT_RPC.ethereum
          totalBalance += await fetchEvmBalance(rpcUrl, rule.contract, w.wallet_address, rule.decimals ?? 18)
        } else if (w.chain_type === 'evm' && rule.symbol === 'ETH') {
          const rpcUrl = DEFAULT_RPC[rule.evm_chain || 'ethereum'] || DEFAULT_RPC.ethereum
          totalBalance += await fetchEvmNativeBalance(rpcUrl, w.wallet_address)
        } else if (w.chain_type === 'solana' && rule.contract) {
          totalBalance += await fetchSolanaBalance(rule.contract, w.wallet_address)
        } else if (w.chain_type === 'solana' && rule.symbol === 'SOL') {
          totalBalance += await fetchSolanaNativeBalance(w.wallet_address)
        } else if (w.chain_type === 'wax') {
          const waxContract = rule.contract || (rule.symbol === 'WAX' ? 'eosio.token' : rule.symbol === 'TLM' ? 'alien.worlds' : '')
          if (waxContract && rule.symbol) {
            totalBalance += await fetchWaxBalance(w.wallet_address, waxContract, rule.symbol)
          }
        }
      }

      return {
        rule: rule.type,
        pass: totalBalance >= minBalance,
        balance: totalBalance,
        detail: `${totalBalance} ${rule.symbol || ''} (required: ${minBalance})`,
      }
    }

    case 'custom_token': {
      if (!rule.rpc_url || !rule.token_address) {
        return { rule: rule.type, pass: false, detail: 'rpc_url and token_address required' }
      }
      const minBalance = rule.min_balance ?? 0
      let totalBalance = 0

      for (const w of wallets) {
        if (w.chain_type === 'evm') {
          totalBalance += await fetchEvmBalance(rule.rpc_url, rule.token_address, w.wallet_address, rule.decimals ?? 18)
        } else if (w.chain_type === 'solana') {
          totalBalance += await fetchSolanaBalance(rule.token_address, w.wallet_address)
        }
      }

      return {
        rule: rule.type,
        pass: totalBalance >= minBalance,
        balance: totalBalance,
        detail: `${totalBalance} ${rule.token_symbol || ''} (required: ${minBalance})`,
      }
    }

    case 'nft_ownership': {
      if (!rule.collection) {
        return { rule: rule.type, pass: false, detail: 'collection required' }
      }

      let found = false
      for (const w of wallets) {
        if (w.chain_type === 'evm') {
          const chain = rule.evm_chain || 'ethereum'
          const nftRpc = DEFAULT_NFT_RPC[chain]
          if (!nftRpc) continue
          const nfts = await fetchEvmNfts(nftRpc, rule.collection, w.wallet_address)
          if (nfts.length > 0) { found = true; break }
        } else if (w.chain_type === 'solana') {
          const nfts = await fetchSolanaNfts(w.wallet_address, rule.collection)
          if (nfts.length > 0) { found = true; break }
        } else if (w.chain_type === 'wax') {
          const nfts = await fetchWaxNfts(w.wallet_address, rule.collection, rule.schema)
          if (nfts.length > 0) { found = true; break }
        }
      }

      return { rule: rule.type, pass: found, detail: found ? 'NFT found' : 'No matching NFT' }
    }

    case 'nft_trait': {
      if (!rule.collection || !rule.trait_type) {
        return { rule: rule.type, pass: false, detail: 'collection and trait_type required' }
      }

      let found = false
      for (const w of wallets) {
        let nftData: Record<string, unknown>[] = []

        if (w.chain_type === 'evm') {
          const chain = rule.evm_chain || 'ethereum'
          const nftRpc = DEFAULT_NFT_RPC[chain]
          if (!nftRpc) continue
          const raw = await fetchEvmNfts(nftRpc, rule.collection, w.wallet_address)
          nftData = raw.map((r: string) => JSON.parse(r))
        } else if (w.chain_type === 'solana') {
          const items = await fetchSolanaNfts(w.wallet_address, rule.collection)
          nftData = items.map(i => {
            const meta = ((i.content as Record<string, unknown>)?.metadata || {}) as Record<string, unknown>
            return { attributes: meta.attributes || [] }
          })
        } else if (w.chain_type === 'wax') {
          const items = await fetchWaxNfts(w.wallet_address, rule.collection, rule.schema)
          nftData = items.map(i => {
            const data = (i.data || i.immutable_data || {}) as Record<string, unknown>
            return {
              attributes: Object.entries(data).map(([k, v]) => ({ trait_type: k, value: v })),
            }
          })
        }

        for (const nft of nftData) {
          const attrs = (nft.attributes || []) as { trait_type?: string; value?: unknown }[]
          const match = attrs.find(a =>
            a.trait_type === rule.trait_type &&
            (rule.trait_value === undefined || String(a.value) === rule.trait_value)
          )
          if (match) { found = true; break }
        }
        if (found) break
      }

      return {
        rule: rule.type,
        pass: found,
        detail: found ? `Found NFT with ${rule.trait_type}=${rule.trait_value || '*'}` : 'No matching trait',
      }
    }

    case 'nft_collection_count': {
      if (!rule.collection) {
        return { rule: rule.type, pass: false, detail: 'collection required' }
      }
      const minCount = rule.min_count ?? 1
      let totalCount = 0

      for (const w of wallets) {
        if (w.chain_type === 'evm') {
          const chain = rule.evm_chain || 'ethereum'
          const nftRpc = DEFAULT_NFT_RPC[chain]
          if (!nftRpc) continue
          const nfts = await fetchEvmNfts(nftRpc, rule.collection, w.wallet_address)
          totalCount += nfts.length
        } else if (w.chain_type === 'solana') {
          const nfts = await fetchSolanaNfts(w.wallet_address, rule.collection)
          totalCount += nfts.length
        } else if (w.chain_type === 'wax') {
          const nfts = await fetchWaxNfts(w.wallet_address, rule.collection, rule.schema)
          totalCount += nfts.length
        }
      }

      return {
        rule: rule.type,
        pass: totalCount >= minCount,
        count: totalCount,
        detail: `${totalCount} NFTs (required: ${minCount})`,
      }
    }

    default:
      return { rule: 'unknown', pass: false, detail: `Unknown rule type: ${rule.type}` }
  }
}
