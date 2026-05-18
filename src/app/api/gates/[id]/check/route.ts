import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { EVM_CHAINS, SOLANA_RPC, WAX_RPC, rpcCall } from '@/lib/blockchain/rpc'

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY || ''
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || ''
const DIVI_RPC = process.env.NEXT_PUBLIC_DIVI_RPC || 'https://services.divi.domains/api/rpc/'
const TIMEOUT = 8000

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getEvmRpc(evmChain: string): string[] {
  const chain = EVM_CHAINS[evmChain || 'ethereum']
  return chain?.rpcs || EVM_CHAINS.ethereum.rpcs
}

// ── Balance fetchers ──

async function getEvmBalance(rpcs: string[], contract: string, wallet: string, decimals = 18): Promise<number> {
  const data = '0x70a08231' + wallet.slice(2).padStart(64, '0')
  const result = await rpcCall(rpcs, 'eth_call', [{ to: contract, data }, 'latest'])
  if (!result?.result || (result.result as string) === '0x') return 0
  return parseInt(result.result as string, 16) / Math.pow(10, decimals)
}

async function getEvmNativeBalance(rpcs: string[], wallet: string): Promise<number> {
  const result = await rpcCall(rpcs, 'eth_getBalance', [wallet, 'latest'])
  if (!result?.result) return 0
  return parseInt(result.result as string, 16) / 1e18
}

async function getSolBalance(mint: string, wallet: string): Promise<number> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [wallet, { mint }, { encoding: 'jsonParsed' }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const data = await res.json()
    let total = 0
    for (const acc of data.result?.value || []) total += parseFloat(acc.account.data.parsed.info.tokenAmount.uiAmountString || '0')
    return total
  } catch { return 0 }
}

async function getSolNativeBalance(wallet: string): Promise<number> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [wallet] }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return ((await res.json()).result?.value || 0) / 1e9
  } catch { return 0 }
}

async function getWaxBalance(account: string, contract: string, symbol: string): Promise<number> {
  try {
    const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: contract, account, symbol }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? parseFloat(data[0].split(' ')[0]) : 0
  } catch { return 0 }
}

async function getDiviBalance(address: string): Promise<number> {
  try {
    const res = await fetch(DIVI_RPC, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ jsonrpc: '1.0', id: 'gate', method: 'getaddressbalance', params: [{ addresses: [address] }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const data = await res.json()
    if (data.result && typeof data.result.balance === 'number') return data.result.balance / 1e8
    return 0
  } catch { return 0 }
}

// ── NFT ownership checks ──

async function checkEvmNftOwnership(wallets: string[], collection: string, evmChain: string): Promise<{ owns: boolean; count: number }> {
  const alchemyChains: Record<string, string> = {
    ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  }
  const url = alchemyChains[evmChain]
  if (!url || !ALCHEMY_KEY) return { owns: false, count: 0 }

  let total = 0
  for (const wallet of wallets) {
    try {
      const res = await fetch(`${url}/getNFTsForOwner?owner=${encodeURIComponent(wallet)}&contractAddresses[]=${encodeURIComponent(collection)}&withMetadata=false&pageSize=100`, { signal: AbortSignal.timeout(TIMEOUT) })
      if (!res.ok) continue
      const data = await res.json()
      total += (data.ownedNfts || []).length
    } catch { /* skip */ }
  }
  return { owns: total > 0, count: total }
}

async function checkEvmNftTrait(wallets: string[], collection: string, evmChain: string, traitType: string, traitValue?: string): Promise<boolean> {
  const alchemyChains: Record<string, string> = {
    ethereum: `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    polygon: `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
    base: `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`,
  }
  const url = alchemyChains[evmChain]
  if (!url || !ALCHEMY_KEY) return false

  for (const wallet of wallets) {
    try {
      const res = await fetch(`${url}/getNFTsForOwner?owner=${encodeURIComponent(wallet)}&contractAddresses[]=${encodeURIComponent(collection)}&withMetadata=true&pageSize=100`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      const data = await res.json()
      for (const nft of data.ownedNfts || []) {
        const attrs = nft.raw?.metadata?.attributes || []
        const match = attrs.find((a: { trait_type?: string; value?: unknown }) =>
          a.trait_type === traitType && (traitValue === undefined || traitValue === null || String(a.value) === traitValue)
        )
        if (match) return true
      }
    } catch { /* skip */ }
  }
  return false
}

async function checkSolanaNftOwnership(wallets: string[], collection: string): Promise<{ owns: boolean; count: number }> {
  let total = 0
  for (const wallet of wallets) {
    try {
      const res = await fetch(SOLANA_RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getAssetsByOwner',
          params: { ownerAddress: wallet, page: 1, limit: 1000, displayOptions: { showCollectionMetadata: true } },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      for (const item of data.result?.items || []) {
        if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') continue
        const groups = (item.grouping || []) as { group_key: string; group_value: string }[]
        if (groups.some(g => g.group_key === 'collection' && g.group_value === collection)) total++
      }
    } catch { /* skip */ }
  }
  return { owns: total > 0, count: total }
}

async function checkWaxNftOwnership(wallets: string[], collection: string): Promise<{ owns: boolean; count: number }> {
  let total = 0
  for (const wallet of wallets) {
    try {
      const res = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${encodeURIComponent(wallet)}&collection_name=${encodeURIComponent(collection)}&limit=1`, { signal: AbortSignal.timeout(TIMEOUT) })
      const data = await res.json()
      if (data.success) total += (data.data || []).length
    } catch { /* skip */ }
  }
  return { owns: total > 0, count: total }
}

async function checkSolanaNftTrait(wallets: string[], collection: string, traitType: string, traitValue?: string): Promise<boolean> {
  for (const wallet of wallets) {
    try {
      const res = await fetch(SOLANA_RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getAssetsByOwner',
          params: { ownerAddress: wallet, page: 1, limit: 1000, displayOptions: { showCollectionMetadata: true } },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      for (const item of data.result?.items || []) {
        if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') continue
        const groups = (item.grouping || []) as { group_key: string; group_value: string }[]
        if (!groups.some(g => g.group_key === 'collection' && g.group_value === collection)) continue
        const attrs = item.content?.metadata?.attributes || []
        if (attrs.find((a: { trait_type?: string; value?: unknown }) =>
          a.trait_type === traitType && (traitValue === undefined || traitValue === null || String(a.value) === traitValue)
        )) return true
      }
    } catch { /* skip */ }
  }
  return false
}

async function checkWaxNftTrait(wallets: string[], collection: string, traitType: string, traitValue?: string): Promise<boolean> {
  for (const wallet of wallets) {
    try {
      const res = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${encodeURIComponent(wallet)}&collection_name=${encodeURIComponent(collection)}&limit=100`, { signal: AbortSignal.timeout(TIMEOUT) })
      const data = await res.json()
      for (const asset of data.data || []) {
        const d = asset.data || asset.immutable_data || {}
        if (d[traitType] !== undefined && (traitValue === undefined || traitValue === null || String(d[traitType]) === traitValue)) return true
      }
    } catch { /* skip */ }
  }
  return false
}

// ── Rule evaluator ──

interface GateRule {
  rule_type: string; chain?: string; evm_chain?: string; source?: string
  collection_address?: string; symbol?: string; contract?: string
  trait_type?: string; trait_value?: string; operator: string; amount?: number
}

interface RuleResult { rule_type: string; pass: boolean; detail: string }

async function evaluateRule(rule: GateRule, wallets: { evm: string[]; solana: string[]; wax: string[]; divi: string[] }): Promise<RuleResult> {
  const op = rule.operator || 'must_have'

  switch (rule.rule_type) {
    case 'nft_ownership': {
      let result = { owns: false, count: 0 }
      if (rule.chain === 'evm' && rule.collection_address) {
        result = await checkEvmNftOwnership(wallets.evm, rule.collection_address, rule.evm_chain || 'polygon')
      } else if (rule.chain === 'solana' && rule.collection_address) {
        result = await checkSolanaNftOwnership(wallets.solana, rule.collection_address)
      } else if (rule.chain === 'wax' && rule.collection_address) {
        result = await checkWaxNftOwnership(wallets.wax, rule.collection_address)
      }
      const pass = op === 'must_have' ? result.owns : op === 'must_not_have' ? !result.owns : op === 'gte' ? result.count >= (rule.amount ?? 1) : op === 'lte' ? result.count <= (rule.amount ?? 0) : result.owns
      return { rule_type: rule.rule_type, pass, detail: `${result.count} NFTs owned` }
    }

    case 'nft_collection_count': {
      let count = 0
      if (rule.chain === 'evm' && rule.collection_address) {
        count = (await checkEvmNftOwnership(wallets.evm, rule.collection_address, rule.evm_chain || 'polygon')).count
      } else if (rule.chain === 'solana' && rule.collection_address) {
        count = (await checkSolanaNftOwnership(wallets.solana, rule.collection_address)).count
      } else if (rule.chain === 'wax' && rule.collection_address) {
        count = (await checkWaxNftOwnership(wallets.wax, rule.collection_address)).count
      }
      const pass = op === 'gte' ? count >= (rule.amount ?? 1) : op === 'lte' ? count <= (rule.amount ?? 0) : count > 0
      return { rule_type: rule.rule_type, pass, detail: `${count} NFTs (${op} ${rule.amount ?? 0})` }
    }

    case 'nft_trait': {
      if (!rule.trait_type) return { rule_type: rule.rule_type, pass: false, detail: 'trait_type required' }
      let found = false
      if (rule.chain === 'evm' && rule.collection_address) {
        found = await checkEvmNftTrait(wallets.evm, rule.collection_address, rule.evm_chain || 'polygon', rule.trait_type, rule.trait_value || undefined)
      } else if (rule.chain === 'solana' && rule.collection_address) {
        found = await checkSolanaNftTrait(wallets.solana, rule.collection_address, rule.trait_type, rule.trait_value || undefined)
      } else if (rule.chain === 'wax' && rule.collection_address) {
        found = await checkWaxNftTrait(wallets.wax, rule.collection_address, rule.trait_type, rule.trait_value || undefined)
      }
      const pass = op === 'must_have' ? found : op === 'must_not_have' ? !found : found
      return { rule_type: rule.rule_type, pass, detail: found ? `Has ${rule.trait_type}=${rule.trait_value || '*'}` : 'Not found' }
    }

    case 'token_balance':
    case 'custom_token': {
      let balance = 0
      if (rule.chain === 'evm') {
        const rpcs = getEvmRpc(rule.evm_chain || 'ethereum')
        if (rule.contract || rule.collection_address) {
          for (const w of wallets.evm) balance += await getEvmBalance(rpcs, (rule.contract || rule.collection_address)!, w)
        } else if (rule.symbol === 'ETH') {
          for (const w of wallets.evm) balance += await getEvmNativeBalance(rpcs, w)
        }
      } else if (rule.chain === 'solana') {
        if (rule.contract) {
          for (const w of wallets.solana) balance += await getSolBalance(rule.contract, w)
        } else if (rule.symbol === 'SOL') {
          for (const w of wallets.solana) balance += await getSolNativeBalance(w)
        }
      } else if (rule.chain === 'wax') {
        const waxContract = rule.contract || (rule.symbol === 'WAX' ? 'eosio.token' : rule.symbol === 'TLM' ? 'alien.worlds' : '')
        if (waxContract && rule.symbol) {
          for (const w of wallets.wax) balance += await getWaxBalance(w, waxContract, rule.symbol)
        }
      } else if (rule.chain === 'divi' && (rule.symbol === 'DIVI' || !rule.symbol)) {
        for (const w of wallets.divi) balance += await getDiviBalance(w)
      }
      const amt = rule.amount ?? 0
      const pass = op === 'gte' ? balance >= amt : op === 'lte' ? balance <= amt : op === 'must_have' ? balance > 0 : op === 'must_not_have' ? balance === 0 : balance >= amt
      return { rule_type: rule.rule_type, pass, detail: `Balance: ${balance} (${op} ${amt})` }
    }

    default:
      return { rule_type: rule.rule_type, pass: false, detail: 'Unknown rule type' }
  }
}

// POST /api/gates/:id/check — Check if user passes this gate
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const body = await request.json()
  const token = body.token as string
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const db = getServiceDb()

  // Get gate and rules
  const { data: gate } = await db.from('token_gates').select('*').eq('id', id).single()
  if (!gate) return NextResponse.json({ error: 'Gate not found' }, { status: 404 })
  if (!gate.is_active) return NextResponse.json({ error: 'Gate is inactive' }, { status: 400 })

  const { data: rules } = await db.from('token_gate_rules').select('*').eq('gate_id', id).order('sort_order')
  if (!rules || rules.length === 0) {
    return NextResponse.json({ pass: false, results: [], gate_id: id, display_id: gate.display_id, detail: 'Gate has no rules configured' })
  }

  // Get user's wallets
  const { data: walletData } = await db.from('connected_wallets').select('chain_type, wallet_address').eq('user_id', user.id)
  const wallets = {
    evm: (walletData || []).filter(w => w.chain_type === 'evm').map(w => w.wallet_address),
    solana: (walletData || []).filter(w => w.chain_type === 'solana').map(w => w.wallet_address),
    wax: (walletData || []).filter(w => w.chain_type === 'wax').map(w => w.wallet_address),
    divi: (walletData || []).filter(w => w.chain_type === 'divi').map(w => w.wallet_address),
  }

  // Evaluate each rule
  const results: RuleResult[] = []
  for (const rule of rules) {
    const result = await evaluateRule(rule as GateRule, wallets)
    results.push(result)
  }

  const allPass = results.every(r => r.pass)

  return NextResponse.json({
    pass: allPass,
    gate_id: id,
    display_id: gate.display_id,
    results,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
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
