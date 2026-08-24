'use client'

/**
 * Card-shaped NFT thumbnail tile — the same look as the SSO NFT inventory cards:
 * a square, dark tile that shows the art (object-fit contain) and, when the image
 * is missing or fails to load, a neutral "No image" placeholder instead of a
 * broken-image icon. IPFS images retry across gateways (dweb.link → ipfs.io)
 * before falling back to the placeholder.
 */
import type { CSSProperties, SyntheticEvent } from 'react'

const GATEWAYS = ['dweb.link', 'ipfs.io']

function onImgError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  const m = img.src.match(/^https:\/\/([^/]+)\/ipfs\/(.+)$/)
  if (m) {
    const next = GATEWAYS[GATEWAYS.indexOf(m[1]) + 1]
    if (next) { img.src = `https://${next}/ipfs/${m[2]}`; return }
  }
  img.style.display = 'none' // reveal the placeholder behind it
}

export function NftThumb({ src, alt = '', border, placeholder = 'No image', radius = 8 }: {
  src: string | null | undefined
  alt?: string
  border?: string
  placeholder?: string
  radius?: number
}) {
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
      {src && (
        // crossOrigin="anonymous" is REQUIRED: Chrome blocks no-cors cross-origin
        // gateway images (they send ACAO:* but no CORP header), so without this
        // the image is blocked and only the placeholder shows.
        <img src={src} alt={alt} loading="lazy" crossOrigin="anonymous" data-pin-nopin="true" onError={onImgError}
          style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }} />
      )}
    </div>
  )
}
