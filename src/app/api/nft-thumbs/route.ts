import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

const BUCKET = 'nft-thumbs'
const MAX_STATIC_SIZE = 800
const WEBP_QUALITY = 80
const BATCH_SIZE = 10
const DOWNLOAD_TIMEOUT = 8000

interface ThumbRequest {
  id: string
  imageUrl: string | null
  chain: string
}

function thumbPath(chain: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200)
  return `${chain.toLowerCase().replace(/[^a-z0-9]/g, '')}/${safe}.webp`
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
    if (buffer.length < 100 || buffer.length > 20_000_000) return null
    return buffer
  } catch {
    return null
  }
}

async function generateThumb(imageBuffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(imageBuffer)
      .resize({
        width: MAX_STATIC_SIZE,
        height: MAX_STATIC_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body.action as string) || 'generate'

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

  // Generate missing thumbnails in batches
  for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
    const batch = toGenerate.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (nft) => {
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
  }

  // No cleanup here — cleanup should be a separate admin action,
  // not per-request, to avoid deleting valid thumbs from other views/pages

  return NextResponse.json({ thumbs })
}
