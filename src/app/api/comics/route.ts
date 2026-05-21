/**
 * PATCH /api/comics   — admin upsert of a comic's name/pages JSON.
 * Body: { cid, name?, format?, pages?: [{label, file, tier?, section?}] }
 * Used by the Reader's right-click "rename page" (admin only).
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { migrateLegacyComic } from '@/lib/comics/migrate'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const cid = String(body.cid || '').trim()
  const nameHint = String(body.nameHint || body.name || '').trim() || null
  if (!/^[A-Za-z0-9]+$/.test(cid)) {
    return NextResponse.json({ error: 'Bad cid' }, { status: 400 })
  }

  const db = svc()
  // Consolidate any legacy (name-derived or per-mint) row first so the
  // rename/patch lands on the unified contract-address row, not a stub.
  await migrateLegacyComic(db, cid, nameHint)

  const row: Record<string, unknown> = { cid, updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') row.name = body.name
  // format: 'pages' | 'webtoon'. Only written when explicitly sent — needs
  // the optional `format` column to exist (see docs/comics-fallback-migration.sql).
  if (body.format === 'pages' || body.format === 'webtoon') row.format = body.format
  if (Array.isArray(body.pages)) {
    // Look up existing pages so we can preserve fields (tier, section, ar)
    // that the client doesn't echo back on a rename or delete patch.
    const { data: existing } = await db.from('comics').select('pages').eq('cid', cid).maybeSingle()
    const existingByFile = new Map<string, { tier?: string; section?: string; ar?: Record<string, string> }>()
    for (const p of (existing?.pages || []) as { file?: string; tier?: string; section?: string; ar?: Record<string, string> }[]) {
      if (p?.file) existingByFile.set(String(p.file), { tier: p.tier, section: p.section, ar: p.ar })
    }
    row.pages = body.pages.map((p: { label?: unknown; file?: unknown; tier?: unknown; section?: unknown; ar?: unknown }) => {
      const file = String(p?.file ?? '').replace(/[^A-Za-z0-9._-]/g, '')
      const prior = existingByFile.get(file)
      const tierRaw = p?.tier !== undefined ? p.tier : prior?.tier
      const tier = tierRaw ? String(tierRaw).trim().toLowerCase().slice(0, 24) : null
      const sectionRaw = p?.section !== undefined ? p.section : prior?.section
      const section = sectionRaw ? String(sectionRaw).trim().slice(0, 48) : null
      const ar = (p?.ar && typeof p.ar === 'object') ? p.ar : prior?.ar
      const out: Record<string, unknown> = {
        label: String(p?.label ?? ''),
        file,
      }
      if (tier && tier !== 'base') out.tier = tier
      if (section) out.section = section
      if (ar && typeof ar === 'object' && Object.keys(ar).length) out.ar = ar
      return out
    })
  }
  const { data, error } = await db
    .from('comics')
    .upsert(row, { onConflict: 'cid' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort cleanup of orphaned page images after a delete.
  if (Array.isArray(body.deleteFiles) && body.deleteFiles.length) {
    const paths = body.deleteFiles
      .map((f: unknown) => String(f).replace(/[^A-Za-z0-9._-]/g, ''))
      .filter(Boolean)
      .map((f: string) => `${cid}/${f}`)
    if (paths.length) await db.storage.from('comic_pages').remove(paths).catch(() => {})
  }

  return NextResponse.json({ comic: data })
}
