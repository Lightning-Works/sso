'use client'

/**
 * NFT media tile with animation + persistent caching.
 *
 * - Shows `staticSrc` (a fast, reliable static thumbnail — the same-origin proxy
 *   webp) immediately.
 * - If `animatedSrc` is given (the ORIGINAL IPFS art, which for Alien Worlds is
 *   an animated webp the thumbnail proxy flattens), it is displayed the same way
 *   the main SSO wallet does it: a PLAIN <img> pointing straight at the gateway.
 *   Animated webps/gifs play natively in an <img>, no CORS or fetch needed, and
 *   the browser's own HTTP cache makes repeat views instant. It fades in over the
 *   static frame once loaded; on error we walk to the next gateway, then give up
 *   to the static frame (never a broken-image icon).
 * - If `cacheKey` is given, we ALSO persist the bytes to IndexedDB in the
 *   background (best-effort fetch) and prefer that cached blob on later views, so
 *   the art survives gateway outages. This never blocks display.
 * - The earlier version tried to fetch()+blob the animated art for DISPLAY, which
 *   needs CORS + a live gateway and so showed nothing during a 503 — that was the
 *   "not animated" bug.
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
  fill?: boolean
  maxHeight?: string
  radius?: number
  border?: string
  placeholder?: string
  style?: CSSProperties
}) {
  const [cur, setCur] = useState(staticSrc)
  const [failed, setFailed] = useState(false)
  const [animCur, setAnimCur] = useState<string | null>(null) // displayed animated url (gateway or cached blob)
  const [animReady, setAnimReady] = useState(false)
  const objUrl = useRef<string | null>(null)

  useEffect(() => { setCur(staticSrc); setFailed(false) }, [staticSrc])

  useEffect(() => {
    let cancelled = false
    setAnimReady(false)
    if (objUrl.current) { URL.revokeObjectURL(objUrl.current); objUrl.current = null }
    // Display the original straight away via a plain <img> — animates immediately
    // when the gateway serves it (or from the browser cache).
    setAnimCur(animatedSrc || null)
    if (!animatedSrc || !cacheKey) return
    ;(async () => {
      // Prefer a previously cached blob (offline, no gateway needed).
      const cached = await getMedia(cacheKey)
      if (cached && !cancelled) { const u = URL.createObjectURL(cached); objUrl.current = u; setAnimCur(u); return }
      // Otherwise fetch once in the background and store for next time.
      const blob = await fetchWithFallback(animatedSrc)
      if (blob && !cancelled) putMedia(cacheKey, blob).catch(() => {})
    })()
    return () => { cancelled = true }
  }, [animatedSrc, cacheKey])

  useEffect(() => () => { if (objUrl.current) URL.revokeObjectURL(objUrl.current) }, [])

  const onStaticErr = () => { const nx = nextGateway(cur || ''); if (nx) { setCur(nx); return } setFailed(true) }
  const onAnimErr = () => {
    if (animCur && animCur.startsWith('blob:')) return // cached blob shouldn't fail; ignore
    const nx = nextGateway(animCur || '')
    if (nx) { setAnimReady(false); setAnimCur(nx); return }
    setAnimReady(false) // give up — the static frame stays
  }

  const wrap: CSSProperties = {
    position: 'relative', overflow: 'hidden', background: 'var(--nft-thumb-bg, #1a1a1c)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius, border, ...style,
  }
  const staticStyle: CSSProperties = { display: 'block', width: '100%', height: fill ? '100%' : 'auto', maxHeight, objectFit: fit, position: 'relative', zIndex: 1 }
  const overlay: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, zIndex: 2, opacity: animReady ? 1 : 0, transition: 'opacity .3s ease' }

  return (
    <div style={wrap}>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'color-mix(in srgb, var(--aww-text-muted) 60%, transparent)' }}>{placeholder}</span>
      {cur && !failed && <img src={cur} alt={alt} crossOrigin="anonymous" data-pin-nopin="true" onError={onStaticErr} style={staticStyle} />}
      {animCur && <img src={animCur} alt={alt} data-pin-nopin="true" onLoad={() => setAnimReady(true)} onError={onAnimErr} style={overlay} />}
    </div>
  )
}
