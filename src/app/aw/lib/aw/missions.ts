/**
 * Alien Worlds Missions (BSC) — read-only. Fetches our own /api/aw/missions route,
 * which enriches the official missions API with each mission's reward-NFT metadata
 * server-side (the Pinata gateway blocks cross-origin JSON fetches from the browser).
 */
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

export async function fetchMissions(): Promise<Mission[]> {
  const r = await fetch('/api/aw/missions')
  if (!r.ok) throw new Error('failed to load missions')
  const d = await r.json()
  return (d.missions || []) as Mission[]
}
