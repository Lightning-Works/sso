'use client'

/**
 * ComicReader — opens a LightningWorks readable-comic NFT.
 *
 * Chrome matches the NftGrid lightbox (dark backdrop + 4-layer purple
 * glow). 95vh panel, #111111 background, double-buffered page swaps (no
 * white flash). Gateway: dweb.link (what the rest of the SSO uses).
 *
 * PAGE NAMES: real page labels (COVER, BC, L1, AD1, …) are not in the NFT
 * metadata or our code — they live inside the IPFS bundle. So on open we
 * probe the bundle for a page manifest (pages.json / manifest.json /
 * comic.json / index.json) from the user's browser and, if found, use its
 * names (a number is only shown when the page has no real name). If no
 * manifest is exposed we fall back to numbered pages. Manifest shapes vary,
 * so parsing is heuristic; confirming the real filename/shape from a loaded
 * comic makes it exact with a one-line change.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const GATEWAY = 'https://dweb.link/ipfs/'
const FALLBACK_TOTAL = 32
const LOAD_TIMEOUT_MS = 15000
const MANIFEST_NAMES = ['pages.json', 'manifest.json', 'comic.json', 'index.json']

interface Pg { label: string; url: string }

function resolveIpfs(url: string): string {
  return url.startsWith('ipfs://') ? GATEWAY + url.slice('ipfs://'.length) : url
}

function deriveLabel(file: string): string {
  const f = file.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '')
  if (/^\d+$/.test(f)) return f
  return f.toUpperCase()
}

/** Best-effort parse of an unknown manifest into a {label,url} list. */
function parseManifest(j: unknown, base: string): Pg[] | null {
  const arr: unknown[] | null = Array.isArray(j) ? j
    : (j && typeof j === 'object' && Array.isArray((j as Record<string, unknown>).pages))
      ? (j as Record<string, unknown>).pages as unknown[] : null
  if (!arr || !arr.length) return null
  const abs = (x: string) => (/^(https?|ipfs):\/\//.test(x) ? resolveIpfs(x) : base + x.replace(/^\.?\//, ''))
  return arr.map((it, i) => {
    if (typeof it === 'string') return { label: deriveLabel(it), url: abs(it) }
    const o = (it || {}) as Record<string, unknown>
    const file = String(o.file || o.src || o.url || o.path || o.html || `${i + 1}.html`)
    const name = o.name || o.label || o.title || o.page
    return { label: name ? String(name) : deriveLabel(file), url: abs(file) }
  })
}

export function ComicReader({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const entry = resolveIpfs(url)
  const base = entry.replace(/[^/]*$/, '')

  const fallback = useCallback((): Pg[] => {
    const list: Pg[] = [{ label: '1', url: entry }]
    for (let n = 2; n <= FALLBACK_TOTAL; n++) list.push({ label: String(n), url: `${base}${n}.html` })
    return list
  }, [entry, base])

  const [pages, setPages] = useState<Pg[]>(fallback)
  const [idx, setIdx] = useState(0)
  const [front, setFront] = useState(0)
  const [src, setSrc] = useState<[string, string]>([entry, ''])
  const [failed, setFailed] = useState(false)
  const [perGroup, setPerGroup] = useState(10)
  const barRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Probe the bundle for a page manifest (names) — progressive enhancement
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const m of MANIFEST_NAMES) {
        try {
          const r = await fetch(base + m, { cache: 'no-store' })
          if (!r.ok) continue
          const list = parseManifest(await r.json(), base)
          if (list && list.length && !cancelled) { setPages(list); setIdx(0); return }
        } catch { /* try next */ }
      }
    })()
    return () => { cancelled = true }
  }, [base])

  const targetUrl = pages[idx]?.url ?? entry

  const go = useCallback((i: number) => {
    if (i < 0 || i >= pages.length) return
    setIdx(i)
    setFailed(false)
    const target = pages[i].url
    setFront(f => {
      const back = 1 - f
      setSrc(s => { const n: [string, string] = [s[0], s[1]]; n[back] = target; return n })
      return f
    })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS)
  }, [pages])

  const onSlotLoad = (slot: number) => {
    if (src[slot] === targetUrl) {
      if (timer.current) clearTimeout(timer.current)
      setFailed(false)
      setFront(slot)
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(idx + 1)
      else if (e.key === 'ArrowLeft') go(idx - 1)
    }
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('keydown', k); if (timer.current) clearTimeout(timer.current) }
  }, [onClose, go, idx])

  useEffect(() => {
    const calc = () => {
      const w = barRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
      setPerGroup(Math.max(3, Math.floor((w - 320) / 52)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [pages.length])

  const total = pages.length
  const group = Math.floor(idx / perGroup)
  const groups = Math.ceil(total / perGroup)
  const start = group * perGroup
  const end = Math.min(start + perGroup, total)

  const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none', borderRadius: '4px',
    padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer', minWidth: '24px', lineHeight: 1.4,
  }
  const onSel: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }
  // Prev/Next stand out: purple background, white chevron
  const nav: React.CSSProperties = {
    ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff', fontWeight: 700, minWidth: '28px',
  }
  const floatBtn = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: '10px', zIndex: 5,
    background: 'var(--lw-purple, #6a24fa)', color: '#fff', border: 'none',
    width: '46px', height: '66px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '1.6rem', fontWeight: 700, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: 0.9,
  })
  const slotStyle = (i: number): React.CSSProperties => ({
    position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none',
    background: '#111111', opacity: front === i ? 1 : 0,
    transition: 'opacity 0.18s ease', pointerEvents: front === i ? 'auto' : 'none',
  })

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div style={{
        background: '#111111', borderRadius: '12px',
        width: 'min(1100px, 96vw)', height: '95vh', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        boxShadow:
          '0 0 15px 5px rgba(80, 40, 200, 0.5),' +
          '0 0 40px 15px rgba(60, 30, 160, 0.35),' +
          '0 0 80px 30px rgba(40, 20, 120, 0.25),' +
          '0 0 160px 60px rgba(20, 10, 60, 0.15)',
      }}>
        <button
          onClick={onClose} aria-label="Close"
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 6, background: 'rgba(0,0,0,0.5)',
            border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%',
            cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1,
          }}
        >&#x2715;</button>

        <div style={{ flex: 1, position: 'relative', background: '#111111' }}>
          {[0, 1].map(i => (
            <iframe
              key={i}
              src={src[i] || 'about:blank'}
              title={`${name} — comic`}
              onLoad={() => onSlotLoad(i)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              style={slotStyle(i)}
            />
          ))}

          {/* Floating prev/next — vertically centred, 10px from the edges, 50% larger */}
          {idx > 0 && (
            <button style={floatBtn('left')} title="Previous page" onClick={() => go(idx - 1)}>&#8249;</button>
          )}
          {idx < total - 1 && (
            <button style={floatBtn('right')} title="Next page" onClick={() => go(idx + 1)}>&#8250;</button>
          )}

          {failed && (
            <div style={{
              position: 'absolute', inset: 0, background: '#111111', zIndex: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', textAlign: 'center', padding: '2rem',
            }}>
              <p style={{ color: '#e4dad1', fontSize: '0.95rem', margin: 0 }}>
                &ldquo;{pages[idx]?.label}&rdquo; didn&apos;t load.
              </p>
              <p style={{ color: '#7a7572', fontSize: '0.8rem', margin: 0, maxWidth: '34rem' }}>
                The IPFS content for this comic may be unpinned/missing (e.g. after the Alchemy
                shutdown), or this page doesn&apos;t exist for this title. Other pages may still work.
              </p>
              <button style={{ ...onSel, marginTop: '0.5rem' }} onClick={() => go(idx)}>Retry</button>
            </div>
          )}
        </div>

        <div ref={barRef} style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.6rem',
          background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <span style={{ color: '#7a7572', fontSize: '0.62rem', whiteSpace: 'nowrap', marginRight: '0.2rem' }}>
            {pages[idx]?.label} · {idx + 1}/{total}
          </span>
          <button style={btn} title="First" onClick={() => go(0)} disabled={idx === 0}>|&lsaquo;</button>
          <button style={nav} title="Previous" onClick={() => go(idx - 1)} disabled={idx === 0}>&#8249;</button>
          {groups > 1 && (
            <button style={btn} title="Previous group" onClick={() => go(Math.max(start - perGroup, 0))} disabled={group === 0}>&laquo;</button>
          )}
          {Array.from({ length: end - start }, (_, i) => start + i).map(p => (
            <button key={p} style={p === idx ? onSel : btn} onClick={() => go(p)}>{pages[p].label}</button>
          ))}
          {groups > 1 && (
            <button style={btn} title="Next group" onClick={() => go(Math.min(start + perGroup, total - 1))} disabled={group >= groups - 1}>&raquo;</button>
          )}
          <button style={nav} title="Next" onClick={() => go(idx + 1)} disabled={idx === total - 1}>&#8250;</button>
          <button style={btn} title="Last" onClick={() => go(total - 1)} disabled={idx === total - 1}>&rsaquo;|</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
