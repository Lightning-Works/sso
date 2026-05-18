import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
const GATE_SIGNING_SECRET = process.env.GATE_SIGNING_SECRET || ''
const WAX_RPC = 'https://wax.greymass.com'
const DIVI_RPC = process.env.NEXT_PUBLIC_DIVI_RPC || 'https://services.divi.domains/api/rpc/'
const MAX_RULES = 10

// ── Allowed RPC URLs (prevent SSRF) ──

const ALLOWED_RPC: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  bsc: 'https://bsc-dataseed.binance.org',
  arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  optimism: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  avalanche: `https://api.avax.network/ext/bc/C/rpc`,
  core: 'https://rpc.coredao.org',
  waterfall: 'https://rpc.waterfall.network/',
}

const ALLOWED_NFT_RPC: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
}

// ── Helpers ──

async function getUserWallets(userId: string, chain?: string) {
  const supabase = await createClient()
  let query = supabase.from('connected_wallets').select('*').eq('user_id', userId)
  if (chain) query = query.eq('chain_type', chain)
  const { data } = await query
  return (data || []) as { chain_type: string; wallet_address: string; wallet_provider: string }[]
}

function validateAddress(address: string, chain: string): boolean {
  if (chain === 'evm') return /^0x[0-9a-fA-F]{40}$/.test(address)
  if (chain === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  if (chain === 'wax') return /^[a-z1-5.]{1,13}$/.test(address)
  if (chain === 'divi') return /^D[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)
  return true
}

function signResponse(payload: Record<string, unknown>): string {
  if (!GATE_SIGNING_SECRET) return ''
  const data = JSON.stringify(payload)
  return crypto.createHmac('sha256', GATE_SIGNING_SECRET).update(data).digest('hex')
}

async function fetchEvmBalance(rpcUrl: string, contractAddress: string, walletAddress: string, decimals: number): Promise<number> {
  if (decimals < 0 || decimals > 30) return 0
  const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contractAddress, data }, 'latest'] }),
      signal: AbortSignal.timeout(8000),
    })
    const result = await res.json()
    if (!result.result || result.result === '0x') return 0
    return parseInt(result.result, 16) / Math.pow(10, decimals)
  } catch { return 0 }
}

async function fetchEvmNativeBalance(rpcUrl: string, walletAddress: string): Promise<number> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [walletAddress, 'latest'] }),
      signal: AbortSignal.timeout(8000),
    })
    const result = await res.json()
    if (!result.result) return 0
    return parseInt(result.result, 16) / 1e18
  } catch { return 0 }
}

async function fetchSolanaBalance(mintAddress: string, walletAddress: string): Promise<number> {
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTokenAccountsByOwner',
        params: [walletAddress, { mint: mintAddress }, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    let total = 0
    for (const acc of data.result?.value || []) {
      total += parseFloat(acc.account.data.parsed.info.tokenAmount.uiAmountString || '0')
    }
    return total
  } catch { return 0 }
}

async function fetchSolanaNativeBalance(walletAddress: string): Promise<number> {
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return (data.result?.value || 0) / 1e9
  } catch { return 0 }
}

async function fetchWaxBalance(account: string, contract: string, symbol: string): Promise<number> {
  try {
    const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: contract, account, symbol }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) return parseFloat(data[0].split(' ')[0])
    return 0
  } catch { return 0 }
}

async function fetchDiviBalance(address: string): Promise<number> {
  try {
    const res = await fetch(DIVI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        jsonrpc: '1.0', id: 'gate',
        method: 'getaddressbalance',
        params: [{ addresses: [address] }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    if (data.result && typeof data.result.balance === 'number') {
      return data.result.balance / 1e8
    }
    return 0
  } catch { return 0 }
}

async function fetchEvmNfts(nftRpcUrl: string, contractAddress: string, walletAddress: string): Promise<Record<string, unknown>[]> {
  try {
    const params = new URLSearchParams({
      owner: walletAddress,
      'contractAddresses[]': contractAddress,
      withMetadata: 'true',
      pageSize: '100',
    })
    const res = await fetch(`${nftRpcUrl}/getNFTsForOwner?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.ownedNfts || []).map((n: Record<string, unknown>) => {
      const raw = (n.raw || {}) as Record<string, unknown>
      const meta = (raw.metadata || {}) as Record<string, unknown>
      return { tokenId: n.tokenId, name: n.name, attributes: meta.attributes || [] }
    })
  } catch { return [] }
}

async function fetchSolanaNfts(walletAddress: string, collectionAddress?: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByOwner',
        params: { ownerAddress: walletAddress, page: 1, limit: 1000, displayOptions: { showCollectionMetadata: true } },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    let items = (data.result?.items || []) as Record<string, unknown>[]
    items = items.filter((i: Record<string, unknown>) => i.interface !== 'FungibleToken' && i.interface !== 'FungibleAsset')
    if (collectionAddress) {
      items = items.filter((i: Record<string, unknown>) => {
        const groups = (i.grouping || []) as { group_key: string; group_value: string }[]
        return groups.some(g => g.group_key === 'collection' && g.group_value === collectionAddress)
      })
    }
    return items
  } catch { return [] }
}

async function fetchWaxNfts(account: string, collection: string, schema?: string): Promise<Record<string, unknown>[]> {
  try {
    const params = new URLSearchParams({ owner: account, collection_name: collection, limit: '1000' })
    if (schema) params.set('schema_name', schema)
    const res = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?${params}`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()
    return data.data || []
  } catch { return [] }
}

// ── Types ──

interface GateRule {
  type: 'token_balance' | 'nft_ownership' | 'nft_trait' | 'nft_collection_count' | 'custom_token'
  chain?: 'evm' | 'solana' | 'wax' | 'divi'
  symbol?: string
  contract?: string
  min_balance?: number
  evm_chain?: string
  token_address?: string
  token_symbol?: string
  decimals?: number
  collection?: string
  schema?: string
  trait_type?: string
  trait_value?: string
  min_count?: number
}

interface GateResult {
  rule: string
  pass: boolean
  detail?: string
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
  const rules = body.rules as GateRule[] | undefined

  // ── Authentication: ALWAYS require a valid JWT token ──
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const resolvedUserId = user.id

  // ── Validate rules ──
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: 'rules array is required' }, { status: 400 })
  }
  if (rules.length > MAX_RULES) {
    return NextResponse.json({ error: `Maximum ${MAX_RULES} rules per request` }, { status: 400 })
  }

  // Validate rule parameters
  for (const rule of rules) {
    if (rule.min_balance !== undefined && (typeof rule.min_balance !== 'number' || rule.min_balance < 0)) {
      return NextResponse.json({ error: 'min_balance must be a non-negative number' }, { status: 400 })
    }
    if (rule.min_count !== undefined && (typeof rule.min_count !== 'number' || rule.min_count < 1)) {
      return NextResponse.json({ error: 'min_count must be a positive integer' }, { status: 400 })
    }
    if (rule.decimals !== undefined && (typeof rule.decimals !== 'number' || rule.decimals < 0 || rule.decimals > 30)) {
      return NextResponse.json({ error: 'decimals must be 0-30' }, { status: 400 })
    }
    if (rule.type === 'custom_token') {
      // custom_token: validate evm_chain is in our allowed list (no custom RPC URLs)
      if (!rule.evm_chain || !ALLOWED_RPC[rule.evm_chain]) {
        return NextResponse.json({
          error: `custom_token requires evm_chain from: ${Object.keys(ALLOWED_RPC).join(', ')}`,
        }, { status: 400 })
      }
      if (!rule.token_address) {
        return NextResponse.json({ error: 'custom_token requires token_address' }, { status: 400 })
      }
    }
    if (rule.contract && rule.chain === 'evm' && !validateAddress(rule.contract, 'evm')) {
      return NextResponse.json({ error: `Invalid EVM contract address: ${rule.contract}` }, { status: 400 })
    }
    if (rule.token_address && !validateAddress(rule.token_address, 'evm')) {
      return NextResponse.json({ error: `Invalid token address: ${rule.token_address}` }, { status: 400 })
    }
  }

  // ── Evaluate rules ──
  const results: GateResult[] = []

  for (const rule of rules) {
    try {
      const result = await evaluateRule(resolvedUserId, rule)
      results.push(result)
    } catch {
      results.push({ rule: rule.type, pass: false, detail: 'Evaluation failed' })
    }
  }

  const allPass = results.every(r => r.pass)

  const payload = {
    user_id: resolvedUserId,
    pass: allPass,
    results,
    timestamp: new Date().toISOString(),
  }

  // Sign the response so game servers can verify it wasn't tampered with
  const signature = signResponse(payload)

  return NextResponse.json({
    ...payload,
    ...(signature ? { signature } : {}),
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
          const rpcUrl = ALLOWED_RPC[rule.evm_chain || 'ethereum'] || ALLOWED_RPC.ethereum
          totalBalance += await fetchEvmBalance(rpcUrl, rule.contract, w.wallet_address, rule.decimals ?? 18)
        } else if (w.chain_type === 'evm' && rule.symbol === 'ETH') {
          const rpcUrl = ALLOWED_RPC[rule.evm_chain || 'ethereum'] || ALLOWED_RPC.ethereum
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
        } else if (w.chain_type === 'divi' && (rule.symbol === 'DIVI' || !rule.symbol)) {
          totalBalance += await fetchDiviBalance(w.wallet_address)
        }
      }

      return {
        rule: rule.type,
        pass: totalBalance >= minBalance,
        detail: `Balance check: ${rule.symbol || rule.contract} (required: ${minBalance})`,
      }
    }

    case 'custom_token': {
      if (!rule.evm_chain || !rule.token_address) {
        return { rule: rule.type, pass: false, detail: 'evm_chain and token_address required' }
      }
      const rpcUrl = ALLOWED_RPC[rule.evm_chain]
      if (!rpcUrl) {
        return { rule: rule.type, pass: false, detail: 'Unsupported chain' }
      }
      const minBalance = rule.min_balance ?? 0
      let totalBalance = 0

      for (const w of wallets) {
        if (w.chain_type === 'evm') {
          totalBalance += await fetchEvmBalance(rpcUrl, rule.token_address, w.wallet_address, rule.decimals ?? 18)
        }
      }

      return {
        rule: rule.type,
        pass: totalBalance >= minBalance,
        detail: `Balance check: ${rule.token_symbol || rule.token_address} (required: ${minBalance})`,
      }
    }

    case 'nft_ownership': {
      if (!rule.collection) {
        return { rule: rule.type, pass: false, detail: 'collection required' }
      }
      let found = false
      for (const w of wallets) {
        if (w.chain_type === 'evm') {
          const nftRpc = ALLOWED_NFT_RPC[rule.evm_chain || 'ethereum']
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
          const nftRpc = ALLOWED_NFT_RPC[rule.evm_chain || 'ethereum']
          if (!nftRpc) continue
          nftData = await fetchEvmNfts(nftRpc, rule.collection, w.wallet_address)
        } else if (w.chain_type === 'solana') {
          const items = await fetchSolanaNfts(w.wallet_address, rule.collection)
          nftData = items.map(i => {
            const meta = ((i.content as Record<string, unknown>)?.metadata || {}) as Record<string, unknown>
            return { attributes: meta.attributes || [] }
          })
        } else if (w.chain_type === 'wax') {
          const items = await fetchWaxNfts(w.wallet_address, rule.collection, rule.schema)
          nftData = items.map(i => {
            const d = (i.data || i.immutable_data || {}) as Record<string, unknown>
            return { attributes: Object.entries(d).map(([k, v]) => ({ trait_type: k, value: v })) }
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
          const nftRpc = ALLOWED_NFT_RPC[rule.evm_chain || 'ethereum']
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
        detail: `Collection count: ${totalCount} (required: ${minCount})`,
      }
    }

    default:
      return { rule: 'unknown', pass: false, detail: 'Unknown rule type' }
  }
}
