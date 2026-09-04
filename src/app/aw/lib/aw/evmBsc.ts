'use client'

/**
 * Binance Smart Chain (BSC) support for the AWW — MetaMask connect, BNB/TLM/USDT
 * balances, and the user's Alien Worlds BSC NFTs (mission rewards). Uses the
 * injected wallet (window.ethereum) + the public BSC RPC directly, so it needs no
 * wagmi provider or API key. Reuses the same read pattern as
 * src/lib/wallets/balances/evm-balances.ts.
 */

const BSC_RPC = 'https://bsc-dataseed.binance.org/'
const BSC_CHAIN_ID = '0x38' // 56

export const TLM_BSC = '0x2222227e22102fe3322098e4cbfe18cfebd57c95'  // 4 decimals
export const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955' // 18 decimals
export const AW_NFT = '0xF3857306a37264f15a19ad37DA8A9485e5f7CfB3'    // AlienWorlds-NFT (ERC-721 Enumerable)

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
function eth(): Eth | null {
  const w = typeof window !== 'undefined' ? (window as unknown as { ethereum?: Eth }) : undefined
  return w?.ethereum ?? null
}
export function hasMetaMask(): boolean { return !!eth() }

const KEY = 'aww-bsc-addr'
export function rememberedBsc(): string | null { try { return localStorage.getItem(KEY) } catch { return null } }
export function clearBsc() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }

/** Prompt MetaMask, ensure BSC, return the address. */
export async function connectMetaMask(): Promise<string> {
  const e = eth()
  if (!e) throw new Error('MetaMask not found — install the MetaMask browser extension, then try again.')
  const accs = (await e.request({ method: 'eth_requestAccounts' })) as string[]
  const addr = accs?.[0]
  if (!addr) throw new Error('No account selected in MetaMask.')
  try {
    await e.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] })
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await e.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BSC_CHAIN_ID, chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: [BSC_RPC], blockExplorerUrls: ['https://bscscan.com'] }] })
    }
  }
  try { localStorage.setItem(KEY, addr) } catch { /* ignore */ }
  return addr
}

async function rpc(method: string, params: unknown[]): Promise<string> {
  const r = await fetch(BSC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || 'RPC error')
  return d.result
}
const balOf = (token: string, addr: string) => rpc('eth_call', [{ to: token, data: '0x70a08231' + addr.slice(2).padStart(64, '0') }, 'latest'])
const toNum = (hex: string, decimals: number) => (hex && hex !== '0x' ? Number(BigInt(hex)) / 10 ** decimals : 0)

export type BscBalances = { bnb: number; tlm: number; usdt: number }
export async function fetchBscBalances(addr: string): Promise<BscBalances> {
  const [bnb, tlm, usdt] = await Promise.all([rpc('eth_getBalance', [addr, 'latest']), balOf(TLM_BSC, addr), balOf(USDT_BSC, addr)])
  return { bnb: toNum(bnb, 18), tlm: toNum(tlm, 4), usdt: toNum(usdt, 18) }
}

// ---- BSC Alien Worlds NFTs (mission rewards) ----
function decodeAbiString(hex: string): string {
  try {
    const h = hex.slice(2)
    const len = parseInt(h.slice(64, 128), 16)
    return Buffer.from(h.slice(128, 128 + len * 2), 'hex').toString('utf8')
  } catch { return '' }
}
function ipfs(u: string | null | undefined): string | null {
  if (!u) return null
  const s = String(u)
  if (s.startsWith('ipfs://')) return `https://dweb.link/ipfs/${s.slice(7).replace(/^ipfs\//, '')}`
  if (s.startsWith('http')) return s
  if (/^(Qm|baf)/.test(s)) return `https://dweb.link/ipfs/${s}`
  return s
}

export type BscNft = {
  tokenId: string
  name: string
  image: string | null
  description: string | null
  attributes: { key: string; value: string }[]
  externalUrl: string
}

/** The account's Alien Worlds BSC NFTs (via the enumerable contract). Capped. */
export async function fetchBscAwNfts(addr: string, max = 48): Promise<{ total: number; nfts: BscNft[] }> {
  const balHex = await balOf(AW_NFT, addr)
  const total = balHex && balHex !== '0x' ? Number(BigInt(balHex)) : 0
  const n = Math.min(total, max)
  // token ids
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const data = '0x2f745c59' + addr.slice(2).padStart(64, '0') + i.toString(16).padStart(64, '0') // tokenOfOwnerByIndex
    try { const idHex = await rpc('eth_call', [{ to: AW_NFT, data }, 'latest']); ids.push(BigInt(idHex).toString()) } catch { /* skip */ }
  }
  // metadata per token (tokenURI → IPFS json)
  const nfts: BscNft[] = []
  await Promise.all(ids.map(async id => {
    try {
      const uriData = '0xc87b56dd' + BigInt(id).toString(16).padStart(64, '0') // tokenURI(uint256)
      const uri = decodeAbiString(await rpc('eth_call', [{ to: AW_NFT, data: uriData }, 'latest']))
      const metaUrl = ipfs(uri)
      const meta = metaUrl ? await fetch(metaUrl).then(r => r.json()).catch(() => ({})) : {}
      const attrs = Array.isArray(meta.attributes) ? meta.attributes.map((a: Record<string, unknown>) => ({ key: String(a.trait_type ?? a.key ?? ''), value: String(a.value ?? '') })) : []
      nfts.push({
        tokenId: id,
        name: String(meta.name || `Alien Worlds #${id}`),
        image: ipfs(meta.image ?? meta.img),
        description: meta.description ? String(meta.description) : null,
        attributes: attrs,
        externalUrl: `https://tofunft.com/nft/bsc/${AW_NFT}/${id}`,
      })
    } catch { /* skip token */ }
  }))
  // keep a stable order (newest id first)
  nfts.sort((a, b) => Number(b.tokenId) - Number(a.tokenId))
  return { total, nfts }
}
