/**
 * POST /api/comics/upload  (admin only, multipart/form-data)
 *
 * Uploads a page image to the private comic_pages bucket and updates the
 * comic's pages JSON. Fields:
 *   cid    — comic bundle CID
 *   mode   — 'replace' | 'before' | 'after' | 'append'
 *   index  — target page index (for replace/before/after)
 *   label  — page label (COVER, L1, 1, BC, …)
 *   file   — the image (webp/png/jpg)
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Page { label: string; file: string }

export async function POST(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Bad form' }, { status: 400 }) }

  const cid = String(form.get('cid') || '').trim()
  const mode = String(form.get('mode') || 'append')
  const index = parseInt(String(form.get('index') ?? '-1'), 10)
  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  const labels = form.getAll('label').map(String)

  if (!/^[A-Za-z0-9]+$/.test(cid)) return NextResponse.json({ error: 'Bad cid' }, { status: 400 })
  if (files.length === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) return NextResponse.json({ error: `${f.name}: too large (max 25MB)` }, { status: 400 })
    if (!f.type.startsWith('image/')) return NextResponse.json({ error: `${f.name}: must be an image` }, { status: 400 })
  }

  const db = svc()
  const entries: Page[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const label = ((labels[i] || '').trim() || 'PAGE').slice(0, 40)
    const ext = (f.name.split('.').pop() || f.type.split('/')[1] || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webp'
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page'
    const filename = `${Date.now().toString(36)}-${i}-${slug}.${ext}`
    const up = await db.storage.from('comic_pages').upload(`${cid}/${filename}`, Buffer.from(await f.arrayBuffer()), {
      contentType: f.type || 'image/webp', upsert: true,
    })
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
    entries.push({ label, file: filename })
  }

  const { data: comic } = await db.from('comics').select('name, pages').eq('cid', cid).maybeSingle()
  const pages: Page[] = Array.isArray(comic?.pages) ? comic!.pages as Page[] : []

  if (mode === 'replace' && index >= 0 && index < pages.length) pages.splice(index, 1, ...entries)
  else if (mode === 'before' && index >= 0 && index <= pages.length) pages.splice(index, 0, ...entries)
  else if (mode === 'after' && index >= 0 && index < pages.length) pages.splice(index + 1, 0, ...entries)
  else pages.push(...entries)

  const { data, error } = await db.from('comics')
    .upsert({ cid, name: comic?.name ?? '', pages, updated_at: new Date().toISOString() }, { onConflict: 'cid' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comic: data })
}
