/**
 * On-chain profile for any WAX account (used by the custodian/candidate hover
 * card). Pulls what the chain cheaply exposes:
 *   - account creation date (WAX get_account)
 *   - token holdings + NFT count (our /api/wax-holdings)
 *   - recent marketplace sales (AtomicMarket, seller = account)
 * Custodian tenure + lifetime pay require full action-history indexing, so those
 * are shown from the DAO table seed (vote power / pay rate) rather than faked.
 */

export type AccountProfile = {
  account: string
  createdISO: string | null
  wax: number
  tlm: number
  planetTokens: { symbol: string; amount: number }[]
  nftCount: number
  soldCount: number
  soldVolumeWax: number
  soldCapped: boolean
}

const WAX_RPC = 'https://wax.greymass.com'
const cache = new Map<string, Promise<AccountProfile>>()

export function getAccountProfile(account: string): Promise<AccountProfile> {
  if (!cache.has(account)) cache.set(account, load(account))
  return cache.get(account)!
}

async function load(account: string): Promise<AccountProfile> {
  const [acct, holdings, sold] = await Promise.all([
    fetch(`${WAX_RPC}/v1/chain/get_account`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: account }),
    }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`/api/wax-holdings?account=${encodeURIComponent(account)}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`https://wax.api.atomicassets.io/atomicmarket/v1/sales?seller=${encodeURIComponent(account)}&state=3&collection_name=alien.worlds&limit=100&order=desc&sort=updated`)
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])

  const tokens: { symbol: string; amount: number; planet?: string }[] = holdings?.tokens || []
  const find = (sym: string) => tokens.find(t => t.symbol === sym)?.amount || 0
  const soldData: Record<string, unknown>[] = sold?.data || []
  const soldVolumeWax = soldData.reduce((sum, x) => {
    const p = (x.price as Record<string, unknown>) || {}
    return sum + Number(p.amount || 0) / 10 ** (Number(p.token_precision) || 8)
  }, 0)

  return {
    account,
    createdISO: acct?.created || null,
    wax: find('WAX'),
    tlm: find('TLM'),
    planetTokens: tokens.filter(t => t.planet).map(t => ({ symbol: t.symbol, amount: t.amount })),
    nftCount: (holdings?.nfts || []).reduce((s: number, n: { count: number }) => s + n.count, 0),
    soldCount: soldData.length,
    soldVolumeWax,
    soldCapped: soldData.length >= 100,
  }
}
