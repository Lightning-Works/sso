import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

// Public-data image cache — no per-user data, so the service role (bypasses
// RLS) is correct here, same as gates/loans/comics. The cookie-bound anon
// client used before couldn't write to storage for anonymous visitors,
// which silently broke thumbnail generation for everyone (upload always
// failed → every NFT card and modal fell back to hotlinking the wallet's
// raw external image gateway, which is what actually breaks in-browser).
const supabaseAdmin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// All downloads for a batch request run concurrently (see below), capped
// individually by DOWNLOAD_TIMEOUT — give the function enough wall-clock
// room for a slow gateway response to still land instead of getting killed
// mid-request.
export const maxDuration = 60

const BUCKET = 'nft-thumbs'
const MAX_STATIC_SIZE = 800
const WEBP_QUALITY = 80
const DOWNLOAD_TIMEOUT = 20000
// Bump when the thumbnail encoding changes so existing cached thumbs are
// regenerated under a new key. a1 = animation-preserving webp; a2 = also handle
// large multi-frame sources (lift sharp's input-pixel cap) so big animated cards
// (e.g. 12MB Elgem/Magori) animate instead of falling back to a static frame.
const THUMB_VERSION = 'a2'

interface ThumbRequest {
  id: string
  imageUrl: string | null
  chain: string
}

function thumbPath(chain: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200)
  return `${chain.toLowerCase().replace(/[^a-z0-9]/g, '')}/${safe}.${THUMB_VERSION}.webp`
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LightningWorks-SSO/1.0' },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (contentType.startsWith('video/')) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 100 || buffer.length > 35_000_000) return null
    return buffer
  } catch {
    return null
  }
}

async function generateThumb(imageBuffer: Buffer): Promise<Buffer | null> {
  // Preserve animation: read every frame ({ animated: true }) and re-encode to an
  // animated webp. Some animated files can trip the animated pipeline, so fall
  // back to a static frame rather than producing no thumbnail at all.
  for (const animated of [true, false]) {
    try {
      // limitInputPixels:false so big multi-frame webps (12MB Elgem/Magori) don't
      // blow sharp's default pixel cap and fall back to a static frame. Animated
      // output is capped smaller to keep memory + file size reasonable.
      const size = animated ? 600 : MAX_STATIC_SIZE
      return await sharp(imageBuffer, { animated, limitInputPixels: false })
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    } catch { /* try static next */ }
  }
  return null
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body.action as string) || 'generate'

  // ── Temporary diagnostic: why does the animated encode fail for some sources? ──
  if (action === 'debug') {
    const url = body.url as string
    const buf = await downloadImage(url)
    if (!buf) return NextResponse.json({ err: 'download failed' })
    const out: Record<string, unknown> = { downloaded: buf.length }
    try { out.meta = await sharp(buf, { animated: true, limitInputPixels: false }).metadata() } catch (e) { out.metaErr = String(e) }
    for (const size of [600, 300, 160]) {
      try {
        const b = await sharp(buf, { animated: true, limitInputPixels: false })
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY }).toBuffer()
        out[`animated_${size}`] = `ok ${b.length}`
        break
      } catch (e) { out[`animated_${size}_err`] = String(e).slice(0, 300) }
    }
    return NextResponse.json(out)
  }

  // ── Single NFT refresh ──
  if (action === 'refresh') {
    const nft = body.nft as ThumbRequest | undefined
    if (!nft?.imageUrl) {
      return NextResponse.json({ error: 'No image URL' }, { status: 400 })
    }

    try {
      const path = thumbPath(nft.chain, nft.id)
      const imageBuffer = await downloadImage(nft.imageUrl)
      if (!imageBuffer) {
        return NextResponse.json({ error: 'Failed to download image' }, { status: 502 })
      }

      const thumb = await generateThumb(imageBuffer)
      if (!thumb) {
        return NextResponse.json({ error: 'Failed to process image' }, { status: 502 })
      }

      const { error } = await supabase.storage.from(BUCKET).upload(path, thumb, {
        contentType: 'image/webp',
        upsert: true,
      })
      if (error) {
        return NextResponse.json({ error: 'Failed to upload thumbnail' }, { status: 500 })
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return NextResponse.json({ thumbUrl: urlData.publicUrl + '?v=' + Date.now() })
    } catch (e) {
      console.error('Thumb refresh error:', e)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  // ── Batch generate ──
  const nfts = (body.nfts as ThumbRequest[]) || []
  if (nfts.length === 0) {
    return NextResponse.json({ thumbs: {} })
  }

  const thumbs: Record<string, string> = {}

  // Check which thumbnails already exist
  const existingSet = new Set<string>()
  const chainDirs = [...new Set(nfts.map(n => n.chain.toLowerCase().replace(/[^a-z0-9]/g, '')))]
  for (const dir of chainDirs) {
    try {
      const { data: files } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 })
      if (files) {
        for (const f of files) existingSet.add(`${dir}/${f.name}`)
      }
    } catch { /* bucket may not exist yet */ }
  }

  // Return existing thumb URLs, queue missing ones
  const toGenerate: ThumbRequest[] = []
  for (const nft of nfts) {
    if (!nft.imageUrl) continue
    const path = thumbPath(nft.chain, nft.id)
    if (existingSet.has(path)) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      thumbs[nft.id] = urlData.publicUrl
    } else {
      toGenerate.push(nft)
    }
  }

  // Generate missing thumbnails — all in flight together, not sequential
  // batches. Each download is capped at DOWNLOAD_TIMEOUT individually, so a
  // single slow gateway response can't stall everything behind it; running
  // batches one after another turned that per-image cap into a per-batch one
  // (BATCH_SIZE stragglers away from blowing Vercel's function time limit).
  await Promise.all(toGenerate.map(async (nft) => {
    try {
      const imageBuffer = await downloadImage(nft.imageUrl!)
      if (!imageBuffer) return

      const thumb = await generateThumb(imageBuffer)
      if (!thumb) return

      const path = thumbPath(nft.chain, nft.id)
      const { error } = await supabase.storage.from(BUCKET).upload(path, thumb, {
        contentType: 'image/webp',
        upsert: true,
      })

      if (!error) {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        thumbs[nft.id] = urlData.publicUrl
      }
    } catch {
      // Skip failed thumbnails silently
    }
  }))

  // No cleanup here — cleanup should be a separate admin action,
  // not per-request, to avoid deleting valid thumbs from other views/pages

  return NextResponse.json({ thumbs })
}
