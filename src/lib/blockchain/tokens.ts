/**
 * Token balance fetchers using free RPCs only.
 * Supports EVM (all chains), Solana, WAX.
 */

import { EVM_CHAINS, SOLANA_RPC, WAX_RPC, HELIUS_METADATA_URL, rpcCall, blockscoutFetch } from './rpc'

export interface TokenBalance {
  symbol: string
  name: string
  balance: string
  decimals: number
  contractAddress: string | null
  logoUrl: string | null
  chain: string
  chainKey: string
  walletAddress: string
}

// ── EVM ──

export async function getEvmTokens(chainKey: string, walletAddress: string): Promise<TokenBalance[]> {
  const chain = EVM_CHAINS[chainKey]
  if (!chain) return []

  const tokens: TokenBalance[] = []

  // Native balance
  const nativeData = await rpcCall(chain.rpcs, 'eth_getBalance', [walletAddress, 'latest'])
  if (nativeData?.result) {
    const wei = parseInt(nativeData.result as string, 16)
    const bal = wei / Math.pow(10, chain.nativeDecimals)
    if (bal > 0) {
      tokens.push({
        symbol: chain.nativeSymbol,
        name: chain.nativeName,
        balance: bal.toFixed(6),
        decimals: chain.nativeDecimals,
        contractAddress: null,
        logoUrl: null,
        chain: chain.name,
        chainKey,
        walletAddress,
      })
    }
  }

  // ERC-20 tokens via Blockscout token list (free, no API key)
  if (chain.blockscoutApi) {
    const data = await blockscoutFetch(
      `${chain.blockscoutApi}/addresses/${walletAddress}/tokens?type=ERC-20`
    )
    if (data?.items && Array.isArray(data.items)) {
      for (const item of data.items as Record<string, unknown>[]) {
        const token = item.token as Record<string, unknown> | undefined
        if (!token) continue
        const rawBalance = item.value as string || '0'
        const decimals = parseInt(String(token.decimals || '18'), 10)
        const bal = parseInt(rawBalance, 10) / Math.pow(10, decimals)
        if (bal <= 0) continue

        tokens.push({
          symbol: (token.symbol as string) || '???',
          name: (token.name as string) || '',
          balance: bal.toString(),
          decimals,
          contractAddress: (token.address as string) || null,
          logoUrl: (token.icon_url as string) || null,
          chain: chain.name,
          chainKey,
          walletAddress,
        })
      }
    }
  }

  return tokens
}

// ── Solana ──

export async function getSolanaTokens(walletAddress: string): Promise<TokenBalance[]> {
  const tokens: TokenBalance[] = []

  // Native SOL
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    const lamports = data.result?.value || 0
    if (lamports > 0) {
      tokens.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: (lamports / 1e9).toFixed(6),
        decimals: 9,
        contractAddress: null,
        logoUrl: null,
        chain: 'Solana',
        chainKey: 'solana',
        walletAddress,
      })
    }
  } catch { /* skip */ }

  // SPL tokens
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getTokenAccountsByOwner',
        params: [walletAddress, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    const mints: string[] = []

    for (const account of data.result?.value || []) {
      const info = account.account.data.parsed.info
      const amount = info.tokenAmount
      if (parseFloat(amount.uiAmountString) <= 0) continue
      mints.push(info.mint)
      tokens.push({
        symbol: info.mint.slice(0, 6) + '...',
        name: info.mint,
        balance: amount.uiAmountString,
        decimals: amount.decimals,
        contractAddress: info.mint,
        logoUrl: null,
        chain: 'Solana',
        chainKey: 'solana',
        walletAddress,
      })
    }

    // Fetch metadata for names/symbols/logos
    if (mints.length > 0) {
      try {
        const metaRes = await fetch(HELIUS_METADATA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mintAccounts: mints, includeOffChain: true }),
          signal: AbortSignal.timeout(10000),
        })
        const metaData = await metaRes.json()
        if (Array.isArray(metaData)) {
          for (const meta of metaData) {
            const token = tokens.find(t => t.contractAddress === meta.account)
            if (!token) continue
            if (meta.onChainMetadata?.metadata?.data) {
              token.name = meta.onChainMetadata.metadata.data.name.replace(/\0/g, '').trim()
              token.symbol = meta.onChainMetadata.metadata.data.symbol.replace(/\0/g, '').trim()
            }
            const offImg = meta.offChainMetadata?.metadata?.image
            if (offImg) token.logoUrl = offImg
          }
        }
      } catch { /* metadata fetch failed, keep mint addresses */ }
    }
  } catch { /* skip */ }

  return tokens
}

// ── WAX ──

export async function getWaxTokens(walletAddress: string): Promise<TokenBalance[]> {
  const tokens: TokenBalance[] = []

  // WAX balance
  try {
    const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'eosio.token', account: walletAddress, symbol: 'WAX' }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    if (Array.isArray(data)) {
      for (const balStr of data) {
        const [amount, symbol] = balStr.split(' ')
        tokens.push({
          symbol,
          name: 'WAX Token',
          balance: amount,
          decimals: 8,
          contractAddress: 'eosio.token',
          logoUrl: null,
          chain: 'WAX',
          chainKey: 'wax',
          walletAddress,
        })
      }
    }
  } catch { /* skip */ }

  // TLM balance
  try {
    const res = await fetch(`${WAX_RPC}/v1/chain/get_currency_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'alien.worlds', account: walletAddress, symbol: 'TLM' }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    if (Array.isArray(data)) {
      for (const balStr of data) {
        const [amount, symbol] = balStr.split(' ')
        tokens.push({
          symbol,
          name: 'Trilium',
          balance: amount,
          decimals: 4,
          contractAddress: 'alien.worlds',
          logoUrl: null,
          chain: 'WAX',
          chainKey: 'wax',
          walletAddress,
        })
      }
    }
  } catch { /* skip */ }

  return tokens
}
