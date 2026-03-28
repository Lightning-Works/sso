/**
 * Supabase cache read/write for token balances and NFTs.
 * Tables: token_balances_cache, nft_cache
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
import type { TokenBalance } from './tokens'
import type { BlockchainNft } from './nfts'

// ── Token Balance Cache ──

export interface CachedBalance {
  wallet_address: string
  chain: string
  chain_key: string
  symbol: string
  name: string
  balance: string
  decimals: number
  contract_address: string | null
  logo_url: string | null
  usd_price: number | null
  usd_value: number | null
  updated_at: string
}

export async function getCachedBalances(walletAddress: string): Promise<CachedBalance[]> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('token_balances_cache')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('usd_value', { ascending: false, nullsFirst: false })
  return (data || []) as CachedBalance[]
}

export async function upsertBalances(
  balances: TokenBalance[],
  prices: Record<string, number>,
): Promise<void> {
  if (balances.length === 0) return
  const supabase = getSupabase()

  const rows = balances.map(b => {
    const price = prices[b.symbol] || (b.contractAddress ? prices[b.contractAddress] : null) || null
    const bal = parseFloat(b.balance)
    return {
      wallet_address: b.walletAddress,
      chain: b.chain,
      chain_key: b.chainKey,
      symbol: b.symbol,
      name: b.name,
      balance: b.balance,
      decimals: b.decimals,
      contract_address: b.contractAddress,
      logo_url: b.logoUrl,
      usd_price: price,
      usd_value: price ? bal * price : null,
      updated_at: new Date().toISOString(),
    }
  })

  // Upsert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    await supabase
      .from('token_balances_cache')
      .upsert(rows.slice(i, i + 50), { onConflict: 'wallet_address,chain,symbol' })
  }
}

export async function clearStaleBalances(walletAddress: string, currentSymbols: Set<string>): Promise<void> {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from('token_balances_cache')
    .select('id, symbol, chain')
    .eq('wallet_address', walletAddress)

  if (!existing) return
  const toDelete = existing
    .filter(e => !currentSymbols.has(`${e.chain}-${e.symbol}`))
    .map(e => e.id)

  if (toDelete.length > 0) {
    await supabase.from('token_balances_cache').delete().in('id', toDelete)
  }
}

// ── NFT Cache ──

export interface CachedNft {
  wallet_address: string
  chain: string
  chain_key: string
  nft_id: string
  name: string
  collection: string
  contract_address: string
  image_url: string | null
  thumb_url: string | null
  video_url: string | null
  description: string | null
  token_type: string
  rarity: string | null
  mint_number: string | null
  max_supply: string | null
  floor_price: number | null
  attributes: { key: string; value: string }[]
  external_url: string | null
  updated_at: string
}

export async function getCachedNfts(walletAddress: string): Promise<CachedNft[]> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('nft_cache')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('collection', { ascending: true })
  return (data || []) as CachedNft[]
}

export async function upsertNfts(nfts: BlockchainNft[]): Promise<void> {
  if (nfts.length === 0) return
  const supabase = getSupabase()

  const rows = nfts.map(n => ({
    wallet_address: n.walletAddress,
    chain: n.chain,
    chain_key: n.chainKey,
    nft_id: n.id,
    name: n.name,
    collection: n.collection,
    contract_address: n.contractAddress,
    image_url: n.imageUrl,
    thumb_url: null,
    video_url: n.videoUrl,
    description: n.description,
    token_type: n.tokenType,
    rarity: n.rarity,
    mint_number: n.mintNumber,
    max_supply: n.maxSupply,
    floor_price: n.floorPrice,
    attributes: n.attributes,
    external_url: n.externalUrl,
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < rows.length; i += 50) {
    await supabase
      .from('nft_cache')
      .upsert(rows.slice(i, i + 50), { onConflict: 'wallet_address,nft_id' })
  }
}

export async function clearStaleNfts(walletAddress: string, currentNftIds: Set<string>): Promise<void> {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from('nft_cache')
    .select('id, nft_id')
    .eq('wallet_address', walletAddress)

  if (!existing) return
  const toDelete = existing
    .filter(e => !currentNftIds.has(e.nft_id))
    .map(e => e.id)

  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 50) {
      await supabase.from('nft_cache').delete().in('id', toDelete.slice(i, i + 50))
    }
  }
}
