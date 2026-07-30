'use client'

import { useState, type CSSProperties } from 'react'

/**
 * Spinning planet video, copied from the SSO wallet. The mp4s live in the same
 * deployment's /public/planets, so we reference them directly. The video fades
 * in once loaded (opacity 0 → target over a dark backdrop) so there's no ugly
 * flash before it's ready — the "thumbnail until it loads" effect.
 *   - mode "tile": absolute cover background behind card content (0.7 opacity)
 *   - mode "header": absolute contain hero for the planet detail
 */
export function PlanetVideo({ planet, mode }: { planet: string; mode: 'tile' | 'header' | 'banner' }) {
  const [loaded, setLoaded] = useState(false)
  const base: CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: mode === 'header' ? 'contain' : 'cover', pointerEvents: 'none',
  }
  const target = mode === 'tile' ? 0.7 : 1
  return (
    <video
      src={`/planets/${planet}.mp4`}
      autoPlay loop muted playsInline preload="auto"
      onLoadedData={() => setLoaded(true)}
      style={{ ...base, opacity: loaded ? target : 0, transition: 'opacity .45s ease' }}
    />
  )
}
