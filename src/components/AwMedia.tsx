'use client'

/**
 * NFT media tile. Shows one image (the same-origin proxy thumbnail, which is now
 * an animated webp for animated NFTs — so it animates natively in an <img>).
 *
 * States:
 *  - while the image is downloading, OR while `loading` (its thumbnail is still
 *    being generated upstream): a spinner + "Loading Image".
 *  - on success: the image (each tile reveals independently as it finishes).
 *  - on failure / genuinely no source: a neutral "No image" placeholder.
 *
 * ipfs urls (rare fallback) retry across gateways before failing.
 */
import { useEffect, useState, type CSSProperties } from 'react'

const GATEWAYS = ['dweb.link', 'ipfs.io']
function nextGateway(url: string): string | null {
  const m = url.match(/^https:\/\/([^/]+)\/ipfs\/(.+)$/)
  if (!m) return null
  const n = GATEWAYS[GATEWAYS.indexOf(m[1]) + 1]
  return n ? `https://${n}/ipfs/${m[2]}` : null
}

const SPIN_ID = 'aw-spin-kf'
function ensureSpin() {
  if (typeof document === 'undefined' || document.getElementById(SPIN_ID)) return
  const st = document.createElement('style')
  st.id = SPIN_ID
  st.textContent = '@keyframes awspin{to{transform:rotate(360deg)}}'
  document.head.appendChild(st)
}

export function AwMedia({ src, loading = false, alt = '', fit = 'cover', fill = true, maxHeight, radius, border, placeholder = 'No image', style }: {
  src: string | null | undefined
  loading?: boolean
  alt?: string
  fit?: 'cover' | 'contain'
  fill?: boolean
  maxHeight?: string
  radius?: number
  border?: string
  placeholder?: string
  style?: CSSProperties
}) {
  const [cur, setCur] = useState(src)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(ensureSpin, [])
  useEffect(() => { setCur(src); setLoaded(false); setFailed(false) }, [src])

  const onErr = () => { const nx = nextGateway(cur || ''); if (nx) { setCur(nx); setLoaded(false); return } setFailed(true) }

  const showImg = !!cur && loaded && !failed
  const showSpinner = !showImg && !failed && (loading || !!cur)

  const wrap: CSSProperties = {
    position: 'relative', overflow: 'hidden', background: 'var(--nft-thumb-bg, #1a1a1c)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius, border, ...style,
  }
  const imgStyle: CSSProperties = {
    display: 'block', width: '100%', height: fill ? '100%' : 'auto', maxHeight, objectFit: fit,
    position: 'relative', zIndex: 1, opacity: showImg ? 1 : 0, transition: 'opacity .2s ease',
  }
  const muted = 'color-mix(in srgb, var(--aww-text-muted) 60%, transparent)'

  return (
    <div style={wrap}>
      {!showImg && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: muted }}>
          {showSpinner ? (
            <>
              <span style={{ position: 'relative', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* purple ring spins one way; the gold trilium counter-spins at half speed */}
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)', borderTopColor: 'var(--aww-primary, #b06cff)', animation: 'awspin .8s linear infinite' }} />
                <img src="/aww/trilium.webp" alt="" style={{ width: 15, height: 15, animation: 'awspin 1.6s linear infinite reverse' }} />
              </span>
              <span style={{ fontSize: '0.68rem' }}>Loading Image</span>
            </>
          ) : (
            <span style={{ fontSize: '0.7rem' }}>{placeholder}</span>
          )}
        </span>
      )}
      {cur && !failed && <img src={cur} alt={alt} crossOrigin="anonymous" data-pin-nopin="true" onLoad={() => setLoaded(true)} onError={onErr} style={imgStyle} />}
    </div>
  )
}
