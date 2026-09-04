/**
 * Alien Worlds Missions (BSC) — read-only live data from the official API.
 *
 * Each mission locks TLM ("send a spacecraft") for a fixed run, then returns the
 * TLM plus a share of the reward pool and an NFT. Amounts are TLM×10000 (4 dp).
 * Times are unix seconds: boardingTime → launchTime (join window) → endTime (return).
 */
const API = 'https://api.alienworlds.io/v1/missions/missions?page%5Blimit%5D=100&page%5Bnumber%5D=0&page%5Border%5D=desc'
const GATE = 'https://alienworlds.mypinata.cloud/ipfs/'

export type MissionStatus = 'soon' | 'boarding' | 'inflight' | 'completed'
export type Mission = {
  id: string
  name: string
  description: string
  rewardTlm: number
  minTlm: number
  ships: number
  durationDays: number
  status: MissionStatus
  statusLabel: string
  timeLabel: string
  rewardName: string | null
  rewardImg: string | null
}

const ipfs = (u: unknown): string | null => {
  const s = typeof u === 'string' ? u : ''
  if (!s) return null
  if (s.startsWith('http')) return s
  return GATE + s.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '')
}

function timeLeft(sec: number): string {
  if (sec <= 0) return 'now'
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export async function fetchMissions(): Promise<Mission[]> {
  const r = await fetch(API)
  if (!r.ok) throw new Error('failed to load missions')
  const d = await r.json()
  const data: Record<string, unknown>[] = d.data || []
  const now = Date.now() / 1000

  const parse = (m: Record<string, unknown>): Mission & { nftTokenURI?: string } => {
    const a = (m.attributes as Record<string, unknown>) || {}
    const bt = Number(a.boardingTime) || 0, lt = Number(a.launchTime) || 0, et = Number(a.endTime) || 0
    let status: MissionStatus = 'completed', statusLabel = 'Completed', timeLabel = ''
    if (now < bt) { status = 'soon'; statusLabel = 'Opens soon'; timeLabel = `opens in ${timeLeft(bt - now)}` }
    else if (now < lt) { status = 'boarding'; statusLabel = 'Boarding open'; timeLabel = `boarding closes in ${timeLeft(lt - now)}` }
    else if (now < et) { status = 'inflight'; statusLabel = 'In flight'; timeLabel = `returns in ${timeLeft(et - now)}` }
    else { timeLabel = 'returned' }
    return {
      id: String(m.id ?? a.id ?? ''),
      name: String(a.name || 'Mission'),
      description: String(a.description || ''),
      rewardTlm: (Number(a.reward) || 0) / 10000,
      minTlm: (Number(a.spaceshipCost) || 0) / 10000,
      ships: Number(a.totalShips) || 0,
      durationDays: Math.round((Number(a.duration) || 0) / 86400),
      status, statusLabel, timeLabel,
      rewardName: null, rewardImg: null,
      nftTokenURI: a.nftTokenURI as string | undefined,
    }
  }

  const all = data.map(parse)
  let missions = all.filter(m => m.status !== 'completed')
  if (missions.length === 0) missions = all.slice(0, 12) // fallback: most recent
  const order: Record<MissionStatus, number> = { boarding: 0, soon: 1, inflight: 2, completed: 3 }
  missions.sort((a, b) => order[a.status] - order[b.status] || (a.status === 'boarding' ? 1 : -1))
  missions = missions.slice(0, 30)

  // Reward NFT (name + image) from each mission's token metadata (Pinata gateway).
  await Promise.all(missions.map(async m => {
    if (!m.nftTokenURI) return
    try {
      const meta = await fetch(ipfs(m.nftTokenURI)!).then(r => r.json())
      m.rewardName = meta.name || null
      m.rewardImg = ipfs(meta.image ?? meta.img)
    } catch { /* leave null */ }
  }))
  return missions
}
