/**
 * WAX Send — action builders for token/coin transfers and NFT transfers.
 *
 * One generic builder per action type (not one-off code per token) so adding
 * a token later is a registry entry, not new logic. Action shapes verified
 * against the existing eosio.token::transfer usage in buyTool.ts and the
 * standard AtomicAssets contract interface.
 */
import type { WaxAction } from './waxSession'

const RPC = 'https://wax.greymass.com'

export interface WaxTokenInfo {
  contract: string
  decimals: number
}

// Contract + decimals per sendable WAX-chain token shown on the wallet page.
// Planet/syndicate tokens (EYE/KAV/MAG/NAR/NER/VEL) share one contract,
// token.worlds, and only their LIQUID portion is sendable — staked amounts
// are locked in DAO voting and never reach this registry's callers.
export const WAX_TOKEN_REGISTRY: Record<string, WaxTokenInfo> = {
  WAX: { contract: 'eosio.token', decimals: 8 },
  TLM: { contract: 'alien.worlds', decimals: 4 },
  EYE: { contract: 'token.worlds', decimals: 4 },
  KAV: { contract: 'token.worlds', decimals: 4 },
  MAG: { contract: 'token.worlds', decimals: 4 },
  NAR: { contract: 'token.worlds', decimals: 4 },
  NER: { contract: 'token.worlds', decimals: 4 },
  VEL: { contract: 'token.worlds', decimals: 4 },
}

export function buildTokenTransferAction(p: {
  from: string
  to: string
  symbol: string
  amount: number
  memo?: string
}): WaxAction {
  const info = WAX_TOKEN_REGISTRY[p.symbol.toUpperCase()]
  if (!info) throw new Error(`Unknown WAX token: ${p.symbol}`)
  const quantity = `${p.amount.toFixed(info.decimals)} ${p.symbol.toUpperCase()}`
  return {
    account: info.contract,
    name: 'transfer',
    authorization: [{ actor: p.from, permission: 'active' }],
    data: { from: p.from, to: p.to, quantity, memo: p.memo || '' },
  }
}

/** Sends one or more NFTs (AtomicAssets asset_ids) to another account in a single signed transaction. */
export function buildNftTransferAction(p: {
  from: string
  to: string
  assetIds: string[]
  memo?: string
}): WaxAction {
  if (p.assetIds.length === 0) throw new Error('No NFTs selected')
  return {
    account: 'atomicassets',
    name: 'transfer',
    authorization: [{ actor: p.from, permission: 'active' }],
    data: { from: p.from, to: p.to, asset_ids: p.assetIds, memo: p.memo || '' },
  }
}

/** Cheap existence check so a typo'd recipient is caught before a signature is requested. */
export async function checkAccountExists(account: string): Promise<boolean> {
  if (!/^[a-z1-5.]{1,12}$/.test(account)) return false
  try {
    const r = await fetch(`${RPC}/v1/chain/get_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ account_name: account }),
    })
    return r.ok
  } catch {
    return false
  }
}
