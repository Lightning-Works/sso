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
  const label = (String(form.get('label') || 'PAGE').trim() || 'PAGE').slice(0, 40)
  const file = form.get('file')

  if (!/^[A-Za-z0-9]+$/.test(cid)) return NextResponse.json({ error: 'Bad cid' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Must be an image' }, { status: 400 })

  const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webp'
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page'
  const filename = `${Date.now().toString(36)}-${slug}.${ext}`

  const db = svc()
  const buf = Buffer.from(await file.arrayBuffer())
  const up = await db.storage.from('comic_pages').upload(`${cid}/${filename}`, buf, {
    contentType: file.type || 'image/webp', upsert: true,
  })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

  const { data: comic } = await db.from('comics').select('name, pages').eq('cid', cid).maybeSingle()
  const pages: Page[] = Array.isArray(comic?.pages) ? comic!.pages as Page[] : []
  const entry: Page = { label, file: filename }

  if (mode === 'replace' && index >= 0 && index < pages.length) pages[index] = entry
  else if (mode === 'before' && index >= 0 && index <= pages.length) pages.splice(index, 0, entry)
  else if (mode === 'after' && index >= 0 && index < pages.length) pages.splice(index + 1, 0, entry)
  else pages.push(entry)

  const { data, error } = await db.from('comics')
    .upsert({ cid, name: comic?.name ?? '', pages, updated_at: new Date().toISOString() }, { onConflict: 'cid' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comic: data })
}
