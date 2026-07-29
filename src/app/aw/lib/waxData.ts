/**
 * AWW data layer — thin typed fetchers over the existing SSO endpoints.
 * Keeping all network access here means feature modules stay pure/presentational
 * and the data source can be swapped without touching the UI.
 */

export type Token = { symbol: string; contract: string | null; amount: number; decimals: number; planet?: string }
export type NftGroup = { collection: string; schema: string; template_id: number; count: number }
export type Holdings = { account: string; tokens: Token[]; nfts: NftGroup[] }

export type Custodian = { name: string; totalVotePower: string; numVoters: number; requestedPay: string; rank: number }
export type Candidate = { name: string; totalVotePower: string; numVoters: number; requestedPay: string }
export type Planet = {
  planet: string; symbol: string; scope: string
  custodians: Custodian[]; candidates: Candidate[]
  numElected: number; maxVotes: number
  totalSupply: string; maxSupply: string
  proposalBudget: string; spendingsBudget: string
  stakingEnabled: boolean
}

/** The six Alien Worlds planets, in canonical order, with brand colors. */
export const PLANETS = [
  { name: 'Magor', symbol: 'MAG', color: '#ff5a3c' },
  { name: 'Eyeke', symbol: 'EYE', color: '#28c76f' },
  { name: 'Kavian', symbol: 'KAV', color: '#c774f0' },
  { name: 'Naron', symbol: 'NAR', color: '#4d9dff' },
  { name: 'Neri', symbol: 'NER', color: '#ffd23c' },
  { name: 'Veles', symbol: 'VEL', color: '#ff4d97' },
] as const

export const planetColor = (name?: string): string =>
  PLANETS.find(p => p.name === name)?.color ?? 'var(--aww-primary)'

export async function fetchHoldings(account: string): Promise<Holdings> {
  const r = await fetch(`/api/wax-holdings?account=${encodeURIComponent(account)}`)
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || 'failed to load holdings')
  return data as Holdings
}

export async function fetchPlanets(): Promise<Planet[]> {
  const res = await Promise.all(
    [0, 1, 2, 3, 4, 5].map(i =>
      fetch(`/api/planet?index=${i}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ),
  )
  return res.filter(Boolean) as Planet[]
}

/** Compact number formatter for token amounts. */
export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
