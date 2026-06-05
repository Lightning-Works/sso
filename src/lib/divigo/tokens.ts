/**
 * DiviGo custom ERC-20 token registry — shared types, chain map, validation.
 *
 * The chains here are the EVM chains DiviGo's backend has (or could have) a
 * provider for. Native-coin slugs match DiviGo's actual coin strings
 * (eth/poly/water/core), discovered from DiviGoReboot src/coins/blockchain/eth.js.
 *
 * IMPORTANT caveat baked into the labels: DiviGo's "binance" is BEP-2
 * (dex.binance.org SDK), NOT BSC/EVM. BEP-20 tokens therefore have no provider
 * in DiviGo today — see docs/DIVIGO-ERC20-TOKEN-REPORT.md. We still let admins
 * register BSC tokens so the registry is complete; `divigoNativeSlug: null`
 * marks the chains DiviGo can't yet service.
 */

export interface DiviGoErc20Chain {
  /** our internal key + the value stored in divigo_custom_tokens.chain */
  key: string
  label: string
  /** maps to EVM_CHAINS in lib/blockchain/rpc.ts for on-chain metadata lookups */
  evmChainKey: string
  /** DiviGo's native-coin slug for this chain, or null if DiviGo has no EVM provider for it */
  divigoNativeSlug: string | null
}

export const DIVIGO_ERC20_CHAINS: Record<string, DiviGoErc20Chain> = {
  ethereum: { key: 'ethereum', label: 'Ethereum', evmChainKey: 'ethereum', divigoNativeSlug: 'eth' },
  polygon: { key: 'polygon', label: 'Polygon', evmChainKey: 'polygon', divigoNativeSlug: 'poly' },
  // DiviGo currently only has BEP-2 (binance.js), no BSC EVM provider.
  bsc: { key: 'bsc', label: 'Binance Smart Chain (BEP-20)', evmChainKey: 'bsc', divigoNativeSlug: null },
  waterfall: { key: 'waterfall', label: 'Waterfall', evmChainKey: 'waterfall', divigoNativeSlug: 'water' },
}

export const DIVIGO_ERC20_CHAIN_KEYS = Object.keys(DIVIGO_ERC20_CHAINS)

export interface CustomToken {
  id: string
  chain: string
  contract_address: string
  symbol: string
  name: string
  decimals: number
  divigo_slug: string | null
  logo_url: string | null
  send_enabled: boolean
  enabled: boolean
  created_at?: string
}

/** EVM contract address: 0x + 40 hex. Returns the lowercased address or null. */
export function normalizeContractAddress(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null
}

export interface TokenInput {
  chain: string
  contract_address: string
  symbol: string
  name: string
  decimals: number
  divigo_slug: string | null
  logo_url: string | null
}

/** Validate + normalize an admin token submission. */
export function validateTokenInput(body: Record<string, unknown>):
  | { ok: true; value: TokenInput }
  | { ok: false; error: string } {
  const chain = String(body.chain ?? '').trim().toLowerCase()
  if (!DIVIGO_ERC20_CHAINS[chain]) {
    return { ok: false, error: `chain must be one of: ${DIVIGO_ERC20_CHAIN_KEYS.join(', ')}` }
  }

  const contract_address = normalizeContractAddress(body.contract_address)
  if (!contract_address) return { ok: false, error: 'contract_address must be a valid 0x… EVM address' }

  const symbol = String(body.symbol ?? '').trim().slice(0, 16)
  if (!symbol) return { ok: false, error: 'symbol is required' }

  const name = String(body.name ?? '').trim().slice(0, 64)
  if (!name) return { ok: false, error: 'name is required' }

  const decimals = Number(body.decimals)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return { ok: false, error: 'decimals must be an integer 0–36' }
  }

  const slugRaw = String(body.divigo_slug ?? '').trim().toLowerCase()
  const divigo_slug = slugRaw ? slugRaw.slice(0, 32) : null
  if (divigo_slug && !/^[a-z0-9_-]+$/.test(divigo_slug)) {
    return { ok: false, error: 'divigo_slug may only contain a–z, 0–9, _ and -' }
  }

  const logoRaw = String(body.logo_url ?? '').trim()
  const logo_url = logoRaw && /^https:\/\//.test(logoRaw) ? logoRaw.slice(0, 500) : null

  return { ok: true, value: { chain, contract_address, symbol, name, decimals, divigo_slug, logo_url } }
}
