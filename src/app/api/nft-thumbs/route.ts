import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

const BUCKET = 'nft-thumbs'
const MAX_STATIC_SIZE = 800
const MAX_ANIMATED_SIZE = 500
const WEBP_QUALITY = 80
const BATCH_SIZE = 10

interface ThumbRequest {
  id: string
  imageUrl: string | null
  chain: string
}

function thumbPath(chain: string, id: string): string {
  // Sanitize id for use as filename
  const safe = id.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200)
  return `${chain.toLowerCase().replace(/[^a-z0-9]/g, '')}/${safe}.webp`
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LightningWorks-SSO/1.0' },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    // Skip video files — we can't thumbnail them with sharp
    if (contentType.startsWith('video/')) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    // Skip if too small (likely error page) or too large (>20MB)
    if (buffer.length < 100 || buffer.length > 20_000_000) return null
    return buffer
  } catch {
    return null
  }
}

async function generateThumb(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata()
  const isAnimated = (meta.pages && meta.pages > 1) || false
  const maxSize = isAnimated ? MAX_ANIMATED_SIZE : MAX_STATIC_SIZE

  const pipeline = sharp(imageBuffer, { animated: isAnimated })
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (isAnimated) {
    // For animated: extract first frame only for grid thumbnail
    return sharp(imageBuffer, { animated: false, pages: 1 })
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  }

  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
}

// POST /api/nft-thumbs — generate thumbnails for a batch of NFTs
export async function POST(request: Request) {
  const supabase = await createClient()

  const body = await request.json()
  const action = body.action || 'generate'

  if (action === 'refresh') {
    // Single NFT refresh
    const nft: ThumbRequest = body.nft
    if (!nft?.imageUrl) {
      return NextResponse.json({ error: 'No image URL' }, { status: 400 })
    }

    const path = thumbPath(nft.chain, nft.id)
    const imageBuffer = await downloadImage(nft.imageUrl)
    if (!imageBuffer) {
      return NextResponse.json({ error: 'Failed to download image' }, { status: 502 })
    }

    const thumb = await generateThumb(imageBuffer)
    await supabase.storage.from(BUCKET).upload(path, thumb, {
      contentType: 'image/webp',
      upsert: true,
    })

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ thumbUrl: urlData.publicUrl + '?v=' + Date.now() })
  }

  // Generate thumbnails for a batch
  const nfts: ThumbRequest[] = body.nfts || []
  const walletAddress: string = body.walletAddress || ''

  if (nfts.length === 0) {
    return NextResponse.json({ thumbs: {} })
  }

  const thumbs: Record<string, string> = {}

  // Check which thumbnails already exist
  const paths = nfts.filter(n => n.imageUrl).map(n => thumbPath(n.chain, n.id))
  const existingSet = new Set<string>()

  // List files in each chain subdirectory
  const chainDirs = [...new Set(nfts.map(n => n.chain.toLowerCase().replace(/[^a-z0-9]/g, '')))]
  for (const dir of chainDirs) {
    const { data: files } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 })
    if (files) {
      for (const f of files) {
        existingSet.add(`${dir}/${f.name}`)
      }
    }
  }

  // Return existing thumb URLs immediately, queue missing ones
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
        // Skip failed thumbnails
      }
    }))
  }

  // Cleanup: remove thumbnails for NFTs no longer in wallet
  if (walletAddress) {
    for (const dir of chainDirs) {
      const { data: files } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 })
      if (!files) continue
      const currentPaths = new Set(nfts.filter(n => n.imageUrl).map(n => thumbPath(n.chain, n.id)))
      const toDelete = files
        .map(f => `${dir}/${f.name}`)
        .filter(p => !currentPaths.has(p))
      if (toDelete.length > 0) {
        await supabase.storage.from(BUCKET).remove(toDelete)
      }
    }
  }

  return NextResponse.json({ thumbs })
}
