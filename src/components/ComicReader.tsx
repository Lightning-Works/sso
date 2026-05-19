'use client'

/**
 * ComicReader — opens a LightningWorks readable-comic NFT.
 *
 * Sources, in order of reliability:
 *  1. Owner-gated webp fallback (Supabase, signed URLs via /api/comic-pages)
 *     — used when configured & the viewer owns the NFT. Labelled pages.
 *  2. The original interactive IPFS bundle, if any gateway still has it
 *     (public content). Offered as a toggle when fallback images exist.
 *
 * Chrome matches the NftGrid lightbox (dark backdrop + 4-layer purple
 * glow). 95vh, #111111 bg, double-buffered (no white flash), purple
 * standout + floating prev/next. Admins can right-click a page button to
 * rename its label (saved to the comic's JSON).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const GATEWAYS = [
  'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/',
  'https://nftstorage.link/ipfs/', 'https://4everland.io/ipfs/', 'https://ipfs.io/ipfs/',
]
const LOAD_TIMEOUT_MS = 12000

interface Pg { label: string; file?: string; img?: string | null }

function parseCid(url: string): { cid: string; entry: string } {
  let rest = url
  if (rest.startsWith('ipfs://')) rest = rest.slice('ipfs://'.length)
  else { const m = rest.match(/\/ipfs\/(.+)$/); if (m) rest = m[1] }
  rest = rest.replace(/^\/+/, '')
  const s = rest.indexOf('/')
  return s === -1 ? { cid: rest, entry: 'index.html' } : { cid: rest.slice(0, s), entry: rest.slice(s + 1) || 'index.html' }
}

export function ComicReader(
  { name, url, onClose, isAdmin = false }: { name: string; url: string; onClose: () => void; isAdmin?: boolean },
) {
  const { cid, entry } = parseCid(url)

  const [phase, setPhase] = useState<'resolving' | 'ready' | 'unavailable'>('resolving')
  const [reason, setReason] = useState('')
  const [pages, setPages] = useState<Pg[]>([])
  const [ipfsEntry, setIpfsEntry] = useState<string | null>(null)
  const [mode, setMode] = useState<'image' | 'interactive'>('image')
  const [admin, setAdmin] = useState(isAdmin)
  const [idx, setIdx] = useState(0)
  const [front, setFront] = useState(0)
  const [imgSrc, setImgSrc] = useState<[string, string]>(['', ''])
  const [failed, setFailed] = useState(false)
  const [perGroup, setPerGroup] = useState(10)
  const barRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resolve = useCallback(async () => {
    setPhase('resolving'); setFailed(false)

    let gwBase: string | null = null
    for (const gw of GATEWAYS) {
      try { const r = await fetch(`${gw}${cid}/${entry}`, { method: 'GET' }); if (r.ok) { gwBase = `${gw}${cid}/`; break } }
      catch { /* next */ }
    }

    let fb: { name?: string; pages?: { label: string; file?: string; url?: string | null }[]; isAdmin?: boolean } | null = null
    let fbStatus = 0
    try {
      const r = await fetch(`/api/comic-pages?cid=${encodeURIComponent(cid)}`)
      fbStatus = r.status
      if (r.ok) fb = await r.json()
    } catch { /* offline */ }

    if (fb?.isAdmin) setAdmin(true)
    setIpfsEntry(gwBase ? gwBase + entry : null)

    if (fb?.pages?.length) {
      setPages(fb.pages.map(p => ({ label: p.label, file: p.file, img: p.url ?? null })))
      setMode('image'); setIdx(0); setImgSrc([fb.pages[0].url ?? '', '']); setFront(0)
      setPhase('ready'); return
    }
    if (gwBase) {                       // no curated fallback, but IPFS is alive
      setPages([{ label: name }]); setMode('interactive'); setIdx(0)
      setPhase('ready'); return
    }
    setReason(
      fbStatus === 401 ? 'Sign in to read this comic.'
      : fbStatus === 403 ? 'You must own this NFT to read it.'
      : 'This comic isn’t available — no fallback is configured and the IPFS copy is missing/unpinned.',
    )
    setPhase('unavailable')
  }, [cid, entry, name])

  useEffect(() => { resolve() }, [resolve])

  const go = useCallback((i: number) => {
    if (mode !== 'image' || i < 0 || i >= pages.length) return
    setIdx(i); setFailed(false)
    const target = pages[i].img || ''
    setFront(f => { const b = 1 - f; setImgSrc(s => { const n: [string, string] = [s[0], s[1]]; n[b] = target; return n }); return f })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS)
  }, [mode, pages])

  const onSlotLoad = (slot: number) => {
    if (imgSrc[slot] && imgSrc[slot] === (pages[idx]?.img || '')) {
      if (timer.current) clearTimeout(timer.current); setFailed(false); setFront(slot)
    }
  }

  const rename = async (i: number) => {
    if (!admin) return
    const cur = pages[i]
    const next = window.prompt(`Rename page (currently "${cur.label}")`, cur.label)
    if (next == null || next === cur.label) return
    const updated = pages.map((p, k) => k === i ? { ...p, label: next } : p)
    setPages(updated)
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, pages: updated.map(p => ({ label: p.label, file: p.file || '' })) }),
      })
      if (!r.ok) throw new Error()
    } catch { setPages(pages); window.alert('Rename failed (not saved).') }
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
      setPerGroup(Math.max(3, Math.floor((w - 340) / 52)))
    }
    calc(); window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [pages.length])

  const total = pages.length
  const group = Math.floor(idx / perGroup)
  const groups = Math.ceil(total / perGroup) || 1
  const start = group * perGroup
  const end = Math.min(start + perGroup, total)
  const navOk = phase === 'ready' && mode === 'image'

  const btn: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none', borderRadius: '4px', padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer', minWidth: '24px', lineHeight: 1.4 }
  const onSel: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }
  const nav: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff', fontWeight: 700, minWidth: '28px' }
  const floatBtn = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '10px', zIndex: 5,
    background: 'var(--lw-purple, #6a24fa)', color: '#fff', border: 'none', width: '46px', height: '66px',
    borderRadius: '8px', cursor: 'pointer', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: 0.9,
  })
  const imgSlot = (i: number): React.CSSProperties => ({
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    background: '#111111', opacity: front === i ? 1 : 0, transition: 'opacity 0.18s ease',
  })
  const msg: React.CSSProperties = { position: 'absolute', inset: 0, background: '#111111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '2rem' }

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{
        background: '#111111', borderRadius: '12px', width: 'min(1100px, 96vw)', height: '95vh',
        display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
        boxShadow: '0 0 15px 5px rgba(80,40,200,0.5),0 0 40px 15px rgba(60,30,160,0.35),0 0 80px 30px rgba(40,20,120,0.25),0 0 160px 60px rgba(20,10,60,0.15)',
      }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, zIndex: 7, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>&#x2715;</button>

        {ipfsEntry && pages.some(p => p.img) && (
          <button
            onClick={() => setMode(m => m === 'image' ? 'interactive' : 'image')}
            style={{ position: 'absolute', top: 8, left: 8, zIndex: 7, ...btn, background: 'rgba(106,36,250,0.25)', color: '#fff' }}
          >{mode === 'image' ? 'Interactive (IPFS)' : 'Page images'}</button>
        )}

        <div style={{ flex: 1, position: 'relative', background: '#111111' }}>
          {phase === 'resolving' && (
            <div style={msg}><p style={{ color: '#bab1a8', fontSize: '0.9rem', margin: 0 }}>Checking comic data&hellip;</p></div>
          )}
          {phase === 'unavailable' && (
            <div style={msg}>
              <p style={{ color: '#e4dad1', fontSize: '1rem', margin: 0 }}>{reason}</p>
              <p style={{ color: '#7a7572', fontSize: '0.78rem', margin: 0, wordBreak: 'break-all' }}>CID {cid}</p>
              <button style={{ ...onSel, marginTop: '0.5rem' }} onClick={resolve}>Retry</button>
            </div>
          )}
          {phase === 'ready' && mode === 'interactive' && ipfsEntry && (
            <iframe src={ipfsEntry} title={`${name} — comic`} sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#111111' }} />
          )}
          {phase === 'ready' && mode === 'image' && (
            <>
              {[0, 1].map(i => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={imgSrc[i] || undefined} alt={`${name} — ${pages[idx]?.label || ''}`} onLoad={() => onSlotLoad(i)} onError={() => { if (imgSrc[i]) setFailed(true) }} style={imgSlot(i)} />
              ))}
              {idx > 0 && <button style={floatBtn('left')} title="Previous page" onClick={() => go(idx - 1)}>&#8249;</button>}
              {idx < total - 1 && <button style={floatBtn('right')} title="Next page" onClick={() => go(idx + 1)}>&#8250;</button>}
              {failed && (
                <div style={{ ...msg, zIndex: 4 }}>
                  <p style={{ color: '#e4dad1', fontSize: '0.95rem', margin: 0 }}>&ldquo;{pages[idx]?.label}&rdquo; didn&apos;t load.</p>
                  <p style={{ color: '#7a7572', fontSize: '0.8rem', margin: 0, maxWidth: '34rem' }}>The page image may be missing for this comic, or the signed link expired.</p>
                  <button style={{ ...onSel, marginTop: '0.5rem' }} onClick={resolve}>Reload</button>
                </div>
              )}
            </>
          )}
        </div>

        <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.6rem', background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <span style={{ color: '#7a7572', fontSize: '0.62rem', whiteSpace: 'nowrap', marginRight: '0.2rem' }}>
            {navOk ? `${pages[idx]?.label} · ${idx + 1}/${total}` : mode === 'interactive' ? 'Interactive comic' : 'Pages'}
          </span>
          <button style={btn} title="First" onClick={() => go(0)} disabled={!navOk || idx === 0}>|&lsaquo;</button>
          <button style={nav} title="Previous" onClick={() => go(idx - 1)} disabled={!navOk || idx === 0}>&#8249;</button>
          {groups > 1 && navOk && <button style={btn} title="Previous group" onClick={() => go(Math.max(start - perGroup, 0))} disabled={group === 0}>&laquo;</button>}
          {navOk && Array.from({ length: end - start }, (_, i) => start + i).map(p => (
            <button key={p} style={p === idx ? onSel : btn} onClick={() => go(p)}
              title={admin ? 'Right-click to rename' : undefined}
              onContextMenu={admin ? (e => { e.preventDefault(); rename(p) }) : undefined}>
              {pages[p].label}
            </button>
          ))}
          {groups > 1 && navOk && <button style={btn} title="Next group" onClick={() => go(Math.min(start + perGroup, total - 1))} disabled={group >= groups - 1}>&raquo;</button>}
          <button style={nav} title="Next" onClick={() => go(idx + 1)} disabled={!navOk || idx >= total - 1}>&#8250;</button>
          <button style={btn} title="Last" onClick={() => go(total - 1)} disabled={!navOk || idx >= total - 1}>&rsaquo;|</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
