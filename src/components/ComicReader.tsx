'use client'

/**
 * ComicReader — LightningWorks readable comics.
 *
 * Sources: owner-gated webp pages (Supabase signed URLs, /api/comic-pages)
 * as the primary reliable view; the original interactive IPFS bundle is
 * offered as a toggle when a gateway still has it.
 *
 * Spreads: COVER and BC (back cover) show alone; every other page shows
 * 2-up with a thin divider. Phone/tablet (narrow) shows one page. Both
 * pages of the current spread are highlighted purple in the page bar.
 *
 * Page turn: a right→left flip animation + a flip sound at 50% volume
 * (/public/page-flip.mp3 — silent no-op if the file isn't present).
 *
 * Admin: right-click a page button → Upload (replace) / Insert before /
 * Insert after / Rename. Chrome matches the NftGrid lightbox.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'

const GATEWAYS = [
  'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/',
  'https://nftstorage.link/ipfs/', 'https://4everland.io/ipfs/', 'https://ipfs.io/ipfs/',
]
const NARROW_MAX = 860
const FALLBACK_TEMPLATE = ['COVER', 'CR1', 'L1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'AD1', 'BC']

interface Pg { label: string; file?: string; img?: string | null }

function parseCid(url: string): { cid: string; entry: string } {
  let r = url
  if (r.startsWith('ipfs://')) r = r.slice(7)
  else { const m = r.match(/\/ipfs\/(.+)$/); if (m) r = m[1] }
  r = r.replace(/^\/+/, '')
  const s = r.indexOf('/')
  return s === -1 ? { cid: r, entry: 'index.html' } : { cid: r.slice(0, s), entry: r.slice(s + 1) || 'index.html' }
}

const isSolo = (label: string) => {
  const t = (label || '').trim().toUpperCase()
  return t === 'COVER' || t === 'BC' || /back\s*cover/i.test(label) || /front\s*cover/i.test(label)
}

function buildSpreads(pages: Pg[], narrow: boolean): number[][] {
  if (narrow) return pages.map((_, i) => [i])
  const out: number[][] = []
  for (let i = 0; i < pages.length;) {
    if (isSolo(pages[i].label)) { out.push([i]); i++; continue }
    if (i + 1 < pages.length && !isSolo(pages[i + 1].label)) { out.push([i, i + 1]); i += 2 }
    else { out.push([i]); i++ }
  }
  return out
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
  const [narrow, setNarrow] = useState(false)
  const [sIdx, setSIdx] = useState(0)
  const [display, setDisplay] = useState<{ label: string; img: string }[]>([])
  const [anim, setAnim] = useState<'none' | 'next' | 'prev'>('none')
  const [failed, setFailed] = useState(false)
  const [perGroup, setPerGroup] = useState(10)
  const [ctx, setCtx] = useState<{ x: number; y: number; index: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<{ mode: string; index: number } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const spreads = useMemo(() => buildSpreads(pages, narrow), [pages, narrow])

  useEffect(() => {
    audio.current = typeof Audio !== 'undefined' ? new Audio('/page-flip.mp3') : null
    if (audio.current) audio.current.volume = 0.5
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${NARROW_MAX}px)`)
    const u = () => setNarrow(mq.matches)
    u(); mq.addEventListener('change', u)
    return () => mq.removeEventListener('change', u)
  }, [])

  const resolve = useCallback(async () => {
    setPhase('resolving'); setFailed(false)
    let gw: string | null = null
    for (const g of GATEWAYS) {
      try { const r = await fetch(`${g}${cid}/${entry}`); if (r.ok) { gw = `${g}${cid}/`; break } } catch { /* next */ }
    }
    let fb: { name?: string; pages?: { label: string; file?: string; url?: string | null }[]; isAdmin?: boolean } | null = null
    let st = 0
    try { const r = await fetch(`/api/comic-pages?cid=${encodeURIComponent(cid)}`); st = r.status; if (r.ok) fb = await r.json() } catch { /* */ }
    if (fb?.isAdmin) setAdmin(true)
    setIpfsEntry(gw ? gw + entry : null)
    if (fb?.pages?.length) {
      setPages(fb.pages.map(p => ({ label: p.label, file: p.file, img: p.url ?? null })))
      setMode('image'); setSIdx(0); setPhase('ready'); return
    }
    if (gw) { setPages([{ label: name }]); setMode('interactive'); setSIdx(0); setPhase('ready'); return }
    setReason(st === 401 ? 'Sign in to read this comic.' : st === 403 ? 'You must own this NFT to read it.'
      : 'This comic isn’t available — no fallback configured and the IPFS copy is missing/unpinned.')
    setPhase('unavailable')
  }, [cid, entry, name])

  useEffect(() => { resolve() }, [resolve])

  const showSpread = useCallback((s: number) => {
    setDisplay(spreads[s]?.map(pi => ({ label: pages[pi].label, img: pages[pi].img || '' })) || [])
  }, [spreads, pages])

  // First render / after data or layout changes
  useEffect(() => {
    if (phase === 'ready' && mode === 'image' && spreads.length) {
      const clamped = Math.min(sIdx, spreads.length - 1)
      if (clamped !== sIdx) setSIdx(clamped)
      showSpread(clamped)
    }
  }, [phase, mode, spreads, sIdx, showSpread])

  const playFlip = () => { const a = audio.current; if (a) { try { a.currentTime = 0; a.play().catch(() => {}) } catch { /* */ } } }

  const go = useCallback((target: number, dir: 'next' | 'prev') => {
    if (mode !== 'image' || target < 0 || target >= spreads.length || target === sIdx) return
    setFailed(false)
    const commit = () => {
      setSIdx(target); showSpread(target); setAnim(dir); playFlip()
      window.setTimeout(() => setAnim('none'), 480)
    }
    const real = spreads[target].map(pi => pages[pi]?.img || '').filter(Boolean)
    if (real.length === 0) { commit(); return }   // unconfigured pages → placeholders, not an error
    Promise.all(real.map(u => new Promise<void>((res, rej) => { const im = new Image(); im.onload = () => res(); im.onerror = () => rej(); im.src = u })))
      .then(commit)
      .catch(() => { commit(); setFailed(true) })
  }, [mode, spreads, sIdx, pages, showSpread])

  const spreadOf = (pageIndex: number) => spreads.findIndex(sp => sp.includes(pageIndex))

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { ctx ? setCtx(null) : onClose() }
      else if (e.key === 'ArrowRight') go(sIdx + 1, 'next')
      else if (e.key === 'ArrowLeft') go(sIdx - 1, 'prev')
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, go, sIdx, ctx])

  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [ctx])

  useEffect(() => {
    const calc = () => {
      const w = barRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
      setPerGroup(Math.max(3, Math.floor((w - 340) / 52)))
    }
    calc(); window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [pages.length])

  // ── Admin actions ──
  const rename = async (i: number) => {
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
    } catch { setPages(pages); window.alert('Rename failed.') }
  }
  const makeFallback = async () => {
    const tpl = FALLBACK_TEMPLATE.map(l => ({ label: l, file: '' }))
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, name, pages: tpl }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'failed')
      await resolve()
    } catch (e) { window.alert('Could not create fallback: ' + (e instanceof Error ? e.message : String(e))) }
  }
  const startUpload = (m: 'replace' | 'before' | 'after', index: number) => {
    pending.current = { mode: m, index }
    fileRef.current?.click()
  }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; const job = pending.current
    e.target.value = ''
    if (!f || !job) return
    const dft = job.mode === 'replace' ? (pages[job.index]?.label || 'PAGE') : 'PAGE'
    const label = window.prompt('Page label (e.g. COVER, L1, 1, AD1, BC)', dft)
    if (label == null) return
    const fd = new FormData()
    fd.append('cid', cid); fd.append('mode', job.mode); fd.append('index', String(job.index))
    fd.append('label', label); fd.append('file', f)
    try {
      const r = await fetch('/api/comics/upload', { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'upload failed')
      await resolve()
    } catch (err) { window.alert('Upload failed: ' + (err instanceof Error ? err.message : String(err))) }
  }

  const total = pages.length
  const curPage = spreads[sIdx]?.[0] ?? 0
  const group = Math.floor(curPage / perGroup)
  const groups = Math.ceil(total / perGroup) || 1
  const gStart = group * perGroup
  const gEnd = Math.min(gStart + perGroup, total)
  const navOk = phase === 'ready' && mode === 'image'
  const activeSet = new Set(spreads[sIdx] || [])

  const btn: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none', borderRadius: '4px', padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer', minWidth: '24px', lineHeight: 1.4 }
  const sel: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }
  const nav: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff', fontWeight: 700, minWidth: '28px' }
  const floatBtn = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '10px', zIndex: 6,
    background: 'var(--lw-purple, #6a24fa)', color: '#fff', border: 'none', width: 46, height: 66,
    borderRadius: 8, cursor: 'pointer', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: 0.9,
  })
  const msg: React.CSSProperties = { position: 'absolute', inset: 0, background: '#111111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '2rem' }

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <style>{`
        @keyframes cr-next{0%{opacity:.3;transform:perspective(1700px) rotateY(11deg) translateX(5%)}100%{opacity:1;transform:none}}
        @keyframes cr-prev{0%{opacity:.3;transform:perspective(1700px) rotateY(-11deg) translateX(-5%)}100%{opacity:1;transform:none}}
        @keyframes cr-sweep-next{0%{transform:translateX(105%)}100%{transform:translateX(-105%)}}
        @keyframes cr-sweep-prev{0%{transform:translateX(-105%)}100%{transform:translateX(105%)}}
        .cr-stage--next{animation:cr-next .45s ease-out}
        .cr-stage--prev{animation:cr-prev .45s ease-out}
        .cr-sweep{position:absolute;inset:0;pointer-events:none;z-index:3;
          background:linear-gradient(90deg,transparent,rgba(0,0,0,.55),transparent)}
        .cr-sweep--next{animation:cr-sweep-next .45s ease-out}
        .cr-sweep--prev{animation:cr-sweep-prev .45s ease-out}
      `}</style>

      <div style={{ background: '#111111', borderRadius: 12, width: 'min(1200px,96vw)', height: '95vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, zIndex: 8, background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>&#x2715;</button>
        {ipfsEntry && pages.some(p => p.img) && (
          <button onClick={() => setMode(m => m === 'image' ? 'interactive' : 'image')}
            style={{ position: 'absolute', top: 8, left: 8, zIndex: 8, ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}>
            {mode === 'image' ? 'Interactive (IPFS)' : 'Page images'}
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />

        <div style={{ flex: 1, position: 'relative', background: '#111111' }}>
          {phase === 'resolving' && <div style={msg}><p style={{ color: '#bab1a8', fontSize: '.9rem', margin: 0 }}>Checking comic data&hellip;</p></div>}
          {phase === 'unavailable' && (
            <div style={msg}>
              <p style={{ color: '#e4dad1', fontSize: '1rem', margin: 0 }}>{reason}</p>
              <p style={{ color: '#7a7572', fontSize: '.78rem', margin: 0, wordBreak: 'break-all' }}>CID {cid}</p>
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                <button style={sel} onClick={resolve}>Retry</button>
                {admin && (
                  <button style={{ ...sel, fontWeight: 700 }} onClick={makeFallback}>MAKE FALLBACK</button>
                )}
              </div>
              {admin && (
                <p style={{ color: '#7a7572', fontSize: '.72rem', margin: '.25rem 0 0', maxWidth: '32rem' }}>
                  Creates an empty page template (COVER, CR1, L1, 1–12, AD1, BC). Then right-click each
                  page button to upload its image.
                </p>
              )}
            </div>
          )}
          {phase === 'ready' && mode === 'interactive' && ipfsEntry && (
            <iframe src={ipfsEntry} title={name} sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#111111' }} />
          )}
          {phase === 'ready' && mode === 'image' && (
            <>
              <div className={anim === 'next' ? 'cr-stage--next' : anim === 'prev' ? 'cr-stage--prev' : undefined}
                style={{ position: 'absolute', inset: 0, display: 'flex', gap: display.length > 1 ? '4px' : 0, background: '#111111' }}>
                {display.map((d, i) => d.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={d.img} alt={`${name} — ${d.label}`} onError={() => setFailed(true)}
                    style={{ flex: 1, minWidth: 0, height: '100%', objectFit: 'contain', background: '#111111' }} />
                ) : (
                  <div key={i} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.4rem', background: '#161616', color: '#7a7572', fontSize: '.85rem', textAlign: 'center', padding: '1rem' }}>
                    <span style={{ color: '#bab1a8' }}>&ldquo;{d.label}&rdquo;</span>
                    <span>No image yet{admin ? ' — right-click this page button below to upload' : ''}</span>
                  </div>
                ))}
              </div>
              {anim !== 'none' && <div className={`cr-sweep cr-sweep--${anim}`} />}
              {sIdx > 0 && <button style={floatBtn('left')} title="Previous" onClick={() => go(sIdx - 1, 'prev')}>&#8249;</button>}
              {sIdx < spreads.length - 1 && <button style={floatBtn('right')} title="Next" onClick={() => go(sIdx + 1, 'next')}>&#8250;</button>}
              {failed && (
                <div style={{ ...msg, zIndex: 5 }}>
                  <p style={{ color: '#e4dad1', fontSize: '.95rem', margin: 0 }}>This page didn&apos;t load.</p>
                  <p style={{ color: '#7a7572', fontSize: '.8rem', margin: 0 }}>The image may be missing for this comic, or the signed link expired.</p>
                  <button style={{ ...sel, marginTop: '.5rem' }} onClick={resolve}>Reload</button>
                </div>
              )}
            </>
          )}
        </div>

        <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', padding: '.4rem .6rem', background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <span style={{ color: '#7a7572', fontSize: '.62rem', whiteSpace: 'nowrap', marginRight: '.2rem' }}>
            {navOk ? `${(spreads[sIdx] || []).map(p => pages[p]?.label).join(' / ')} · ${sIdx + 1}/${spreads.length}` : mode === 'interactive' ? 'Interactive comic' : 'Pages'}
          </span>
          <button style={btn} title="First" onClick={() => go(0, 'prev')} disabled={!navOk || sIdx === 0}>|&lsaquo;</button>
          <button style={nav} title="Previous" onClick={() => go(sIdx - 1, 'prev')} disabled={!navOk || sIdx === 0}>&#8249;</button>
          {groups > 1 && navOk && <button style={btn} title="Prev group" onClick={() => go(spreadOf(Math.max(gStart - perGroup, 0)), 'prev')} disabled={group === 0}>&laquo;</button>}
          {navOk && Array.from({ length: gEnd - gStart }, (_, i) => gStart + i).map(p => (
            <button key={p} style={activeSet.has(p) ? sel : btn}
              title={admin ? 'Right-click: upload / insert / rename' : undefined}
              onContextMenu={admin ? (e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, index: p }) }) : undefined}
              onClick={() => { const s = spreadOf(p); if (s >= 0) go(s, s > sIdx ? 'next' : 'prev') }}>
              {pages[p].label}
            </button>
          ))}
          {groups > 1 && navOk && <button style={btn} title="Next group" onClick={() => go(spreadOf(Math.min(gStart + perGroup, total - 1)), 'next')} disabled={group >= groups - 1}>&raquo;</button>}
          <button style={nav} title="Next" onClick={() => go(sIdx + 1, 'next')} disabled={!navOk || sIdx >= spreads.length - 1}>&#8250;</button>
          <button style={btn} title="Last" onClick={() => go(spreads.length - 1, 'next')} disabled={!navOk || sIdx >= spreads.length - 1}>&rsaquo;|</button>
          {admin && navOk && (
            <button style={{ ...btn, marginLeft: 'auto', background: 'rgba(106,36,250,.25)', color: '#fff' }}
              title="Add a page at the end" onClick={() => startUpload('after', total - 1)}>+ Page</button>
          )}
          {admin && phase === 'ready' && mode === 'interactive' && (
            <button style={{ ...sel, marginLeft: 'auto', fontWeight: 700 }}
              title="Create an editable fallback page template for this comic" onClick={makeFallback}>MAKE FALLBACK</button>
          )}
        </div>
      </div>

      {ctx && admin && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 10001, background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)', borderRadius: 8, padding: '4px 0', minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          {([
            ['Replace current image', () => startUpload('replace', ctx.index)],
            ['Insert before', () => startUpload('before', ctx.index)],
            ['Insert after', () => startUpload('after', ctx.index)],
            ['Rename', () => rename(ctx.index)],
          ] as [string, () => void][]).map(([t, fn]) => (
            <button key={t} onClick={() => { setCtx(null); fn() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.5rem 1rem', background: 'none', border: 'none', color: '#fff', fontSize: '.8rem', cursor: 'pointer' }}>
              {pages[ctx.index]?.label}: {t}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
