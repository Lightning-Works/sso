'use client'

/**
 * Card-shaped NFT thumbnail tile — the same look as the SSO NFT inventory cards:
 * a square, dark tile that shows the art (object-fit contain) and, when the image
 * is missing or fails to load, a neutral "No image" placeholder instead of a
 * broken-image icon.
 *
 * State (not DOM mutation) drives the fallback: on an ipfs load error we advance
 * to the next gateway, and only give up to the placeholder when none are left.
 * IMPORTANT: we reset when the `src` prop changes, so an image that failed while
 * the public gateways were down (503) still loads once a good URL — e.g. the
 * cached Supabase thumbnail — arrives. (An earlier version hid the failed <img>
 * via img.style.display='none', which stuck across src changes and left tiles
 * permanently blank.)
 */
import { useEffect, useState, type CSSProperties } from 'react'

const GATEWAYS = ['dweb.link', 'ipfs.io']

export function NftThumb({ src, alt = '', border, placeholder = 'No image', radius = 8 }: {
  src: string | null | undefined
  alt?: string
  border?: string
  placeholder?: string
  radius?: number
}) {
  const [cur, setCur] = useState<string | null | undefined>(src)
  const [failed, setFailed] = useState(false)

  // A new src (e.g. the proxy thumbnail resolving in) restarts the load.
  useEffect(() => { setCur(src); setFailed(false) }, [src])

  const onError = () => {
    const m = (cur || '').match(/^https:\/\/([^/]+)\/ipfs\/(.+)$/)
    if (m) {
      const next = GATEWAYS[GATEWAYS.indexOf(m[1]) + 1]
      if (next) { setCur(`https://${next}/ipfs/${m[2]}`); return }
    }
    setFailed(true)
  }

  const wrap: CSSProperties = {
    position: 'relative', width: '100%', aspectRatio: '1', borderRadius: radius, overflow: 'hidden',
    background: 'var(--nft-thumb-bg, #1a1a1c)', border,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <div style={wrap}>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'color-mix(in srgb, var(--aww-text-muted) 60%, transparent)' }}>
        {placeholder}
      </span>
      {cur && !failed && (
        // crossOrigin="anonymous": Chrome blocks no-cors cross-origin images that
        // lack a CORP header; the proxy/gateway hosts send ACAO:* so this loads.
        <img src={cur} alt={alt} loading="lazy" crossOrigin="anonymous" data-pin-nopin="true" onError={onError}
          style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
      )}
    </div>
  )
}
