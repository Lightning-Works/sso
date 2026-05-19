'use client'

/**
 * ComicReader — opens a LightningWorks readable-comic NFT.
 *
 * Chrome matches the NftGrid lightbox exactly (dark backdrop + 4-layer
 * purple glow). Panel is 95% of viewport height. Background is #111111
 * (never white). Page changes are double-buffered: the next page loads in
 * a hidden iframe and is only revealed once ready, so there is no white
 * redraw flash — the previous page stays until the new one is loaded.
 *
 * Gateway: dweb.link — the same gateway the rest of the SSO already uses
 * successfully for these LW IPFS assets (ipfs.io rate-limits/403s).
 *
 * ASSUMPTION: metadata gives only one pointer (ipfs://<cid>/index.html);
 * there is no page list. Page 1 = that real entry (the actual
 * data-presence test). Pages 2..N probe <base>/<n>.html. TOTAL and the
 * pattern are one-line changes once the true scheme is known.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const GATEWAY = 'https://dweb.link/ipfs/'
const TOTAL = 32
const LOAD_TIMEOUT_MS = 15000

function resolveIpfs(url: string): string {
  if (url.startsWith('ipfs://')) return GATEWAY + url.slice('ipfs://'.length)
  return url
}

export function ComicReader({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const entry = resolveIpfs(url)
  const base = entry.replace(/[^/]*$/, '')
  const pageUrl = useCallback((p: number) => (p <= 1 ? entry : `${base}${p}.html`), [entry, base])

  const [page, setPage] = useState(1)
  const [front, setFront] = useState(0)               // which iframe slot is visible (0|1)
  const [src, setSrc] = useState<[string, string]>([entry, ''])
  const [failed, setFailed] = useState(false)         // current target didn't load in time
  const [perGroup, setPerGroup] = useState(12)
  const barRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const go = useCallback((p: number) => {
    if (p < 1 || p > TOTAL) return
    setPage(p)
    setFailed(false)
    const target = pageUrl(p)
    setFront(f => {
      const back = 1 - f
      setSrc(s => { const n: [string, string] = [s[0], s[1]]; n[back] = target; return n })
      return f // stay on current until the back slot loads (no flash)
    })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS)
  }, [pageUrl])

  const onSlotLoad = (slot: number) => {
    if (src[slot] === pageUrl(page)) {
      if (timer.current) clearTimeout(timer.current)
      setFailed(false)
      setFront(slot)
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(Math.min(page + 1, TOTAL))
      else if (e.key === 'ArrowLeft') go(Math.max(page - 1, 1))
    }
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('keydown', k); if (timer.current) clearTimeout(timer.current) }
  }, [onClose, go, page])

  useEffect(() => {
    const calc = () => {
      const w = barRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
      setPerGroup(Math.max(4, Math.floor((w - 290) / 34)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const group = Math.floor((page - 1) / perGroup)
  const groups = Math.ceil(TOTAL / perGroup)
  const start = group * perGroup + 1
  const end = Math.min(start + perGroup - 1, TOTAL)

  const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none', borderRadius: '4px',
    padding: '0.2rem 0.4rem', fontSize: '0.68rem', cursor: 'pointer', minWidth: '24px', lineHeight: 1.4,
  }
  const on: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }
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

        {/* double-buffered comic surface (#111111, no white flash on change) */}
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
          {failed && (
            <div style={{
              position: 'absolute', inset: 0, background: '#111111', zIndex: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', textAlign: 'center', padding: '2rem',
            }}>
              <p style={{ color: '#e4dad1', fontSize: '0.95rem', margin: 0 }}>
                Page {page} didn&apos;t load.
              </p>
              <p style={{ color: '#7a7572', fontSize: '0.8rem', margin: 0, maxWidth: '34rem' }}>
                The IPFS content for this comic may be unpinned/missing (e.g. after the Alchemy
                shutdown), or this page number doesn&apos;t exist for this title. Other pages may
                still work — try the buttons below.
              </p>
              <button style={{ ...on, marginTop: '0.5rem' }} onClick={() => go(page)}>Retry</button>
            </div>
          )}
        </div>

        <div ref={barRef} style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.6rem',
          background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <span style={{ color: '#7a7572', fontSize: '0.62rem', whiteSpace: 'nowrap', marginRight: '0.2rem' }}>
            Pages · {page}/{TOTAL}
          </span>
          <button style={btn} title="First" onClick={() => go(1)} disabled={page === 1}>|&lsaquo;</button>
          <button style={btn} title="Previous" onClick={() => go(page - 1)} disabled={page === 1}>&lsaquo;</button>
          {groups > 1 && (
            <button style={btn} title="Previous group" onClick={() => go(Math.max(start - perGroup, 1))} disabled={group === 0}>&laquo;</button>
          )}
          {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
            <button key={p} style={p === page ? on : btn} onClick={() => go(p)}>{p}</button>
          ))}
          {groups > 1 && (
            <button style={btn} title="Next group" onClick={() => go(Math.min(start + perGroup, TOTAL))} disabled={group >= groups - 1}>&raquo;</button>
          )}
          <button style={btn} title="Next" onClick={() => go(page + 1)} disabled={page === TOTAL}>&rsaquo;</button>
          <button style={btn} title="Last" onClick={() => go(TOTAL)} disabled={page === TOTAL}>&rsaquo;|</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
