/**
 * NFT ownership helpers shared by every loan endpoint.
 *
 * "Ownership" here means: the NFT row in `lw_nft_data` has an `owner`
 * (lowercase wallet address) that matches one of the user's connected
 * wallets in `connected_wallets`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function userOwnsNft(
  db: SupabaseClient,
  userId: string,
  contractAddress: string,
  tokenId: string,
): Promise<boolean> {
  const ca = String(contractAddress || '').trim()
  const tk = String(tokenId || '').trim()
  if (!ca || !tk || !userId) return false

  const { data: ct } = await db.from('lw_nft_contracts')
    .select('id').ilike('contract_address', ca).limit(1).maybeSingle()
  if (!ct) return false

  const { data: nft } = await db.from('lw_nft_data')
    .select('owner').eq('contract_id', ct.id).eq('token_id', tk).maybeSingle()
  if (!nft?.owner) return false

  const { data: wallets } = await db.from('connected_wallets')
    .select('wallet_address').eq('user_id', userId)
  const mine = new Set((wallets || []).map(w => String(w.wallet_address).toLowerCase()))
  return mine.has(String(nft.owner).toLowerCase())
}

/** Generate a random URL-safe loan code. */
export function newLoanCode(): string {
  // 20 hex chars from a v4 UUID — short enough for a clean URL, long
  // enough to be effectively unguessable.
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
}
