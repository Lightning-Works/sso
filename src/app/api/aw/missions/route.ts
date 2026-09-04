import { NextResponse } from 'next/server'

/**
 * Live Alien Worlds missions, enriched server-side. We fetch the official missions
 * API plus each mission's reward-NFT metadata here (server-side has no CORS, and
 * the Pinata gateway blocks cross-origin JSON fetches from the browser).
 */
const API = 'https://api.alienworlds.io/v1/missions/missions?page[limit]=100&page[number]=0&page[order]=desc'
// Mission reward metadata lives on the wider IPFS network (the AW Pinata gateway
// returns empty for these CIDs); dweb.link/ipfs.io resolve it (server follows the
// 301 to the subdomain gateway automatically).
const GATEWAYS = ['https://dweb.link/ipfs/', 'https://ipfs.io/ipfs/']

export const revalidate = 60 // cache the enriched list for a minute

const cidOf = (u: unknown): string | null => {
  const s = typeof u === 'string' ? u : ''
  if (!s) return null
  return s.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '')
}
const ipfs = (u: unknown): string | null => {
  const s = typeof u === 'string' ? u : ''
  if (!s) return null
  if (s.startsWith('http')) return s
  return GATEWAYS[0] + cidOf(s)
}
async function fetchIpfsJson(cid: string): Promise<Record<string, unknown> | null> {
  for (const g of GATEWAYS) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 9000)
    try {
      const r = await fetch(g + cid, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      clearTimeout(t)
      if (r.ok) return await r.json()
    } catch { clearTimeout(t) /* next gateway */ }
  }
  return null
}
function timeLeft(sec: number): string {
  if (sec <= 0) return 'now'
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export async function GET() {
  try {
    const r = await fetch(API, { next: { revalidate: 60 } })
    if (!r.ok) return NextResponse.json({ missions: [], error: 'upstream' }, { status: 502 })
    const d = await r.json()
    const data: Record<string, unknown>[] = d.data || []
    const now = Date.now() / 1000

    const parse = (m: Record<string, unknown>) => {
      const a = (m.attributes as Record<string, unknown>) || {}
      const bt = Number(a.boardingTime) || 0, lt = Number(a.launchTime) || 0, et = Number(a.endTime) || 0
      let status = 'completed', statusLabel = 'Completed', timeLabel = 'returned'
      if (now < bt) { status = 'soon'; statusLabel = 'Opens soon'; timeLabel = `opens in ${timeLeft(bt - now)}` }
      else if (now < lt) { status = 'boarding'; statusLabel = 'Boarding open'; timeLabel = `boarding closes in ${timeLeft(lt - now)}` }
      else if (now < et) { status = 'inflight'; statusLabel = 'In flight'; timeLabel = `returns in ${timeLeft(et - now)}` }
      return {
        id: String(m.id ?? a.id ?? ''),
        name: String(a.name || 'Mission'),
        description: String(a.description || ''),
        rewardTlm: (Number(a.reward) || 0) / 10000,
        minTlm: (Number(a.spaceshipCost) || 0) / 10000,
        ships: Number(a.totalShips) || 0,
        durationDays: Math.round((Number(a.duration) || 0) / 86400),
        status, statusLabel, timeLabel,
        rewardName: null as string | null, rewardImg: null as string | null,
        nftTokenURI: (a.nftTokenURI as string) || '',
      }
    }

    const all = data.map(parse)
    let missions = all.filter(m => m.status !== 'completed')
    if (missions.length === 0) missions = all.slice(0, 12)
    const order: Record<string, number> = { boarding: 0, soon: 1, inflight: 2, completed: 3 }
    missions.sort((a, b) => order[a.status] - order[b.status])
    missions = missions.slice(0, 30)

    await Promise.all(missions.map(async m => {
      const cid = cidOf(m.nftTokenURI)
      if (!cid) return
      const meta = await fetchIpfsJson(cid)
      if (!meta) return
      m.rewardName = (meta.name as string) || null
      // Normalise any /ipfs/<cid> image URL to dweb.link so it rides the same
      // reliable path as the WAX NFT art (proxy + gateway fallback).
      const raw = String(meta.image ?? meta.img ?? '')
      const cidMatch = raw.match(/\/ipfs\/([^/?#]+)/)
      m.rewardImg = cidMatch ? `https://dweb.link/ipfs/${cidMatch[1]}` : ipfs(meta.image ?? meta.img)
    }))

    return NextResponse.json({ missions: missions.map(({ nftTokenURI: _drop, ...m }) => m) })
  } catch (e) {
    return NextResponse.json({ missions: [], error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
