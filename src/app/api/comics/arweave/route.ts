/**
 * POST /api/comics/arweave  (admin)
 * Body: { cid, variant? = 'full' }
 *
 * Permanently mirrors a comic's fallback page images to Arweave (the
 * "double fallback"). Downloads each page from the private comic_pages
 * bucket and uploads it to Arweave, recording the tx id under
 * pages[i].ar[variant]. Re-runnable: pages already mirrored for that
 * variant are skipped.
 *
 * 401 not admin · 503 Arweave not configured (no key / package).
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { arweaveConfigured, arweavePut, ArweaveNotConfigured } from '@/lib/arweave'
import { turboConfigured, turboUpload, TurboNotConfigured } from '@/lib/arweave/turbo'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Page { label: string; file?: string; ar?: Record<string, string> }

export async function POST(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
  // Turbo (card/crypto credits, no AR) preferred; raw AR JWK is the fallback.
  const useTurbo = turboConfigured()
  if (!useTurbo && !arweaveConfigured()) {
    return NextResponse.json({ error: 'Arweave not configured — set TURBO_ETH_KEY or ARWEAVE_JWK (see docs/ARWEAVE-DOUBLE-FALLBACK.md)' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const cid = String(body.cid || '').trim()
  const variant = String(body.variant || 'full').replace(/[^A-Za-z0-9_-]/g, '') || 'full'
  if (!/^[A-Za-z0-9]+$/.test(cid)) return NextResponse.json({ error: 'Bad cid' }, { status: 400 })

  const db = svc()
  const { data: comic } = await db.from('comics').select('name, pages').eq('cid', cid).maybeSingle()
  const pages: Page[] = Array.isArray(comic?.pages) ? comic!.pages as Page[] : []
  if (!pages.length) return NextResponse.json({ error: 'No pages for this comic' }, { status: 404 })

  let uploaded = 0, skipped = 0
  const errors: string[] = []

  for (const p of pages) {
    if (!p.file) { skipped++; continue }
    if (p.ar?.[variant]) { skipped++; continue }              // already mirrored
    try {
      const dl = await db.storage.from('comic_pages').download(`${cid}/${p.file}`)
      if (dl.error || !dl.data) throw new Error(dl.error?.message || 'download failed')
      const buf = new Uint8Array(await dl.data.arrayBuffer())
      const ct = dl.data.type || 'image/webp'
      const tags = [
        { name: 'App', value: 'LightningWorks-Comics' },
        { name: 'Comic', value: cid },
        { name: 'Page', value: p.label },
        { name: 'Variant', value: variant },
      ]
      const { id } = useTurbo ? await turboUpload(buf, ct, tags) : await arweavePut(buf, ct, tags)
      p.ar = { ...(p.ar || {}), [variant]: id }
      uploaded++
    } catch (e) {
      if (e instanceof ArweaveNotConfigured || e instanceof TurboNotConfigured) return NextResponse.json({ error: e.message }, { status: 503 })
      errors.push(`${p.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const { error } = await db.from('comics')
    .upsert({ cid, name: comic?.name ?? '', pages, updated_at: new Date().toISOString() }, { onConflict: 'cid' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ uploaded, skipped, errors, variant, total: pages.length })
}
