'use client'

/**
 * NFT media tile with animation + persistent caching.
 *
 * - Shows `staticSrc` (a fast, reliable static thumbnail) immediately.
 * - If `animatedSrc` is given (the original IPFS art, which for Alien Worlds is
 *   an animated webp the thumbnail proxy flattens), it loads in the background
 *   and fades in over the static frame once ready. On failure the static frame
 *   stays — no broken-image icon.
 * - If `cacheKey` is given (the asset id), the animated bytes are read from and
 *   written to IndexedDB, so the second view loads from the user's disk and
 *   survives a gateway outage. The inventory purges keys for sold NFTs.
 * - IPFS images retry across gateways (dweb.link → ipfs.io) before giving up.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getMedia, putMedia } from '@/lib/aw/mediaCache'

const GATEWAYS = ['dweb.link', 'ipfs.io']
function nextGateway(url: string): string | null {
  const m = url.match(/^https:\/\/([^/]+)\/ipfs\/(.+)$/)
  if (!m) return null
  const n = GATEWAYS[GATEWAYS.indexOf(m[1]) + 1]
  return n ? `https://${n}/ipfs/${m[2]}` : null
}

async function fetchWithFallback(url: string): Promise<Blob | null> {
  let u: string | null = url
  while (u) {
    try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) return await r.blob() } catch { /* try next */ }
    u = nextGateway(u)
  }
  return null
}

export function AwMedia({ staticSrc, animatedSrc, cacheKey, alt = '', fit = 'cover', fill = true, maxHeight, radius, border, placeholder = 'No image', style }: {
  staticSrc: string | null | undefined
  animatedSrc?: string | null
  cacheKey?: string
  alt?: string
  fit?: 'cover' | 'contain'
  fill?: boolean       // tile mode: image fills a fixed-aspect box. false = size to image (modal).
  maxHeight?: string
  radius?: number
  border?: string
  placeholder?: string
  style?: CSSProperties
}) {
  const [cur, setCur] = useState(staticSrc)
  const [failed, setFailed] = useState(false)
  const [animUrl, setAnimUrl] = useState<string | null>(null)
  const [animReady, setAnimReady] = useState(false)
  const objUrl = useRef<string | null>(null)

  useEffect(() => { setCur(staticSrc); setFailed(false) }, [staticSrc])

  // Resolve the animated original: IndexedDB first, then the network (cached on success).
  useEffect(() => {
    let cancelled = false
    setAnimReady(false); setAnimUrl(null)
    if (objUrl.current) { URL.revokeObjectURL(objUrl.current); objUrl.current = null }
    if (!animatedSrc) return
    ;(async () => {
      if (cacheKey) {
        const cached = await getMedia(cacheKey)
        if (cached && !cancelled) { const u = URL.createObjectURL(cached); objUrl.current = u; setAnimUrl(u); return }
      }
      const blob = await fetchWithFallback(animatedSrc)
      if (!blob || cancelled) return
      if (cacheKey) putMedia(cacheKey, blob).catch(() => {})
      const u = URL.createObjectURL(blob); objUrl.current = u; setAnimUrl(u)
    })()
    return () => { cancelled = true }
  }, [animatedSrc, cacheKey])

  useEffect(() => () => { if (objUrl.current) URL.revokeObjectURL(objUrl.current) }, [])

  const onErr = () => { const nx = nextGateway(cur || ''); if (nx) { setCur(nx); return } setFailed(true) }

  const wrap: CSSProperties = {
    position: 'relative', overflow: 'hidden', background: 'var(--nft-thumb-bg, #1a1a1c)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius, border, ...style,
  }
  const staticStyle: CSSProperties = { display: 'block', width: '100%', height: fill ? '100%' : 'auto', maxHeight, objectFit: fit, position: 'relative', zIndex: 1 }
  const overlay: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, zIndex: 2, opacity: animReady ? 1 : 0, transition: 'opacity .3s ease' }

  return (
    <div style={wrap}>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'color-mix(in srgb, var(--aww-text-muted) 60%, transparent)' }}>{placeholder}</span>
      {cur && !failed && <img src={cur} alt={alt} crossOrigin="anonymous" data-pin-nopin="true" onError={onErr} style={staticStyle} />}
      {animUrl && <img src={animUrl} alt={alt} onLoad={() => setAnimReady(true)} onError={() => setAnimReady(false)} style={overlay} />}
    </div>
  )
}
