'use client'

/**
 * ComicReader — opens a LightningWorks readable-comic NFT.
 *
 * Chrome matches the NftGrid lightbox exactly (dark backdrop + the 4-layer
 * purple glow). Panel is 95% of viewport height with an iframe and a small
 * bottom page toolbar (first / prev / [grouped page numbers] / next / last,
 * with group jumps when the pages don't all fit).
 *
 * NOTE / ASSUMPTION: comic metadata gives only one pointer
 * (animation_url = ipfs://<cid>/index.html). It does NOT list pages. So
 * page 1 loads that real entry (which is the actual data-presence test —
 * if it's blank, the IPFS bundle is unpinned/gone), and pages 2..N probe
 * `<base>/<n>.html`. TOTAL and the page URL pattern are the one thing to
 * confirm once a comic actually loads — both are trivial to change here.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const GATEWAY = 'https://ipfs.io/ipfs/'
const TOTAL = 32 // assumed max pages (not in metadata) — adjust once confirmed

function resolveIpfs(url: string): string {
  if (url.startsWith('ipfs://')) return GATEWAY + url.slice('ipfs://'.length)
  return url
}

export function ComicReader({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const entry = resolveIpfs(url)                  // …/<cid>/index.html
  const base = entry.replace(/[^/]*$/, '')        // …/<cid>/
  const pageUrl = useCallback((p: number) => (p <= 1 ? entry : `${base}${p}.html`), [entry, base])

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [perGroup, setPerGroup] = useState(12)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setPage(p => Math.min(p + 1, TOTAL))
      else if (e.key === 'ArrowLeft') setPage(p => Math.max(p - 1, 1))
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])

  // How many page buttons fit on the toolbar
  useEffect(() => {
    const calc = () => {
      const w = barRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
      setPerGroup(Math.max(4, Math.floor((w - 280) / 34)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  // Best-effort data-presence check (does this page actually resolve?)
  useEffect(() => {
    setStatus('loading')
    let cancelled = false
    fetch(pageUrl(page), { method: 'GET' })
      .then(r => { if (!cancelled) setStatus(r.ok ? 'ok' : 'fail') })
      .catch(() => { if (!cancelled) setStatus('fail') })
    return () => { cancelled = true }
  }, [page, pageUrl])

  const group = Math.floor((page - 1) / perGroup)
  const groups = Math.ceil(TOTAL / perGroup)
  const start = group * perGroup + 1
  const end = Math.min(start + perGroup - 1, TOTAL)

  const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none',
    borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.68rem',
    cursor: 'pointer', minWidth: '24px', lineHeight: 1.4,
  }
  const on: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div style={{
        background: 'var(--lw-wallet-row-bg, #1a1a1c)', borderRadius: '12px',
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
            position: 'absolute', top: 8, right: 8, zIndex: 5, background: 'rgba(0,0,0,0.5)',
            border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%',
            cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1,
          }}
        >&#x2715;</button>

        <iframe
          key={page}
          src={pageUrl(page)}
          title={`${name} — page ${page}`}
          onLoad={() => setStatus(s => (s === 'fail' ? s : 'ok'))}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          style={{ flex: 1, width: '100%', border: 'none', background: '#0d0d0d' }}
        />

        <div ref={barRef} style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.6rem',
          background: 'rgba(0,0,0,0.55)', borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <span style={{ color: '#7a7572', fontSize: '0.62rem', whiteSpace: 'nowrap', marginRight: '0.2rem' }}>
            Pages · {page}/{TOTAL} · {status === 'loading' ? '…' : status === 'ok' ? 'data ✓' : 'no data ✗'}
          </span>
          <button style={btn} title="First" onClick={() => setPage(1)} disabled={page === 1}>|&lsaquo;</button>
          <button style={btn} title="Previous" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>&lsaquo;</button>
          {groups > 1 && (
            <button style={btn} title="Previous group" onClick={() => setPage(Math.max(start - perGroup, 1))} disabled={group === 0}>&laquo;</button>
          )}
          {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
            <button key={p} style={p === page ? on : btn} onClick={() => setPage(p)}>{p}</button>
          ))}
          {groups > 1 && (
            <button style={btn} title="Next group" onClick={() => setPage(Math.min(start + perGroup, TOTAL))} disabled={group >= groups - 1}>&raquo;</button>
          )}
          <button style={btn} title="Next" onClick={() => setPage(p => Math.min(p + 1, TOTAL))} disabled={page === TOTAL}>&rsaquo;</button>
          <button style={btn} title="Last" onClick={() => setPage(TOTAL)} disabled={page === TOTAL}>&rsaquo;|</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
