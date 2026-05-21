/**
 * GET /api/comics/webtoon-status?contracts=0xaaa,0xbbb
 *
 * For each smart-contract address, reports whether a webtoon-format
 * comic exists for it and how many actual strips (pages with an
 * uploaded image) it has. The wallet grid uses this to decide whether
 * to offer "Read Webtoon" on an NFT — a webtoon is keyed to a contract,
 * so every mint of that contract shares it.
 *
 * Response: { "0xaaa": { exists: true, strips: 7 }, ... }
 * Contracts with no webtoon are simply absent from the map.
 *
 * No auth: this is non-sensitive availability metadata (whether a
 * webtoon exists), already implied by the public comic itself.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { contractCid } from '@/lib/comics/cid'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('contracts') || ''
  const contracts = [...new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 100)
  if (!contracts.length) return NextResponse.json({})

  // Map each synthetic cid back to its contract so we can key the reply.
  const cidToContract = new Map<string, string>()
  for (const c of contracts) {
    const cid = contractCid(c)
    if (cid) cidToContract.set(cid, c)
  }
  if (!cidToContract.size) return NextResponse.json({})

  const db = svc()
  // select('*') tolerates the `format` column not existing yet.
  const { data } = await db.from('comics').select('*').in('cid', [...cidToContract.keys()])

  const out: Record<string, { exists: boolean; strips: number }> = {}
  for (const row of (data || []) as { cid: string; format?: string; pages?: { file?: string }[] }[]) {
    if (row.format !== 'webtoon') continue
    const contract = cidToContract.get(row.cid)
    if (!contract) continue
    const strips = Array.isArray(row.pages) ? row.pages.filter(p => p?.file).length : 0
    out[contract] = { exists: true, strips }
  }

  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  })
}
