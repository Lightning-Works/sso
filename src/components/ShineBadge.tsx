'use client'

/**
 * Alien Worlds "shine" badge — a small word coloured to its shine tier, shown in
 * the corner of an NFT card. Intensity scales with the tier:
 *   (no shine)  → nothing
 *   Stone       → static grey, no animation
 *   Gold        → gold, gentle glow pulse
 *   Stardust    → glow pulse + slow colour shift
 *   Antimatter  → bigger glow + faster colour shift
 *   XDimension  → animated full-rainbow text with a pulsing glow
 *
 * Keyframes are injected once into <head> (inline styles can't declare @keyframes)
 * and referenced by every badge, so any number of cards share one style block.
 */
import { useEffect, type CSSProperties } from 'react'

const KF_ID = 'shine-badge-kf'
const KEYFRAMES = `
@keyframes sbGlowSm{0%,100%{text-shadow:0 0 2px currentColor}50%{text-shadow:0 0 7px currentColor}}
@keyframes sbGlowMd{0%,100%{text-shadow:0 0 3px currentColor}50%{text-shadow:0 0 10px currentColor,0 0 15px currentColor}}
@keyframes sbGlowLg{0%,100%{text-shadow:0 0 4px currentColor,0 0 8px currentColor}50%{text-shadow:0 0 13px currentColor,0 0 22px currentColor}}
@keyframes sbHue{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}
@keyframes sbRainbow{0%{background-position:0% 50%}100%{background-position:300% 50%}}
@keyframes sbPulse{0%,100%{filter:drop-shadow(0 0 2px rgba(255,255,255,.45))}50%{filter:drop-shadow(0 0 9px rgba(255,255,255,.95))}}
`

function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KF_ID)) return
  const st = document.createElement('style')
  st.id = KF_ID
  st.textContent = KEYFRAMES
  document.head.appendChild(st)
}

type Tier = { color?: string; anim?: string; rainbow?: boolean }
const TIERS: Record<string, Tier> = {
  stone: { color: '#b3b3b3' },
  gold: { color: '#ffd24a', anim: 'sbGlowSm 2.2s ease-in-out infinite' },
  stardust: { color: '#7fe0ff', anim: 'sbGlowMd 2s ease-in-out infinite, sbHue 7s linear infinite' },
  antimatter: { color: '#d98bff', anim: 'sbGlowLg 1.8s ease-in-out infinite, sbHue 5s linear infinite' },
  xdimension: { rainbow: true },
}

export function ShineBadge({ shine, style }: { shine?: string | null; style?: CSSProperties }) {
  useEffect(ensureKeyframes, [])
  if (!shine) return null
  const tier = TIERS[shine.toLowerCase().trim()]
  if (!tier) return null // unknown value → show nothing

  const base: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1, ...style }

  if (tier.rainbow) {
    return (
      <span style={{
        ...base, color: 'transparent',
        backgroundImage: 'linear-gradient(90deg,#ff2d55,#ff9500,#ffe000,#34ff6a,#00e0ff,#8b5cff,#ff2d55)',
        backgroundSize: '300% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text',
        animation: 'sbRainbow 3s linear infinite, sbPulse 1.6s ease-in-out infinite',
      }}>{shine}</span>
    )
  }
  return <span style={{ ...base, color: tier.color, animation: tier.anim }}>{shine}</span>
}
