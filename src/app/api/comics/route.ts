/**
 * PATCH /api/comics   — admin upsert of a comic's name/pages JSON.
 * Body: { cid, name?, pages?: [{label, file}] }
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
  if (!/^[A-Za-z0-9]+$/.test(cid)) {
    return NextResponse.json({ error: 'Bad cid' }, { status: 400 })
  }

  const row: Record<string, unknown> = { cid, updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') row.name = body.name
  if (Array.isArray(body.pages)) {
    row.pages = body.pages.map((p: { label?: unknown; file?: unknown }) => ({
      label: String(p?.label ?? ''),
      file: String(p?.file ?? '').replace(/[^A-Za-z0-9._-]/g, ''),
    }))
  }

  const db = svc()
  // Consolidate any legacy per-mint row first so the rename/patch lands
  // on the unified type-level row, not a stale per-mint stub.
  await migrateLegacyComic(db, cid)
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
