'use client'
/* eslint-disable @next/next/no-img-element */

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
import { ComicPageTurn, buildLeafSpreads, type TurnEffect } from './ComicPageTurn'

// One place to switch the page-turn effect — see ComicPageTurn.tsx.
const PAGE_TURN_EFFECT: TurnEffect = 'bookflip'

const GATEWAYS = [
  'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/',
  'https://nftstorage.link/ipfs/', 'https://4everland.io/ipfs/', 'https://ipfs.io/ipfs/',
]
const NARROW_MAX = 860
const FALLBACK_TEMPLATE = ['COVER', 'CR1', 'L1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'AD1', 'BC']

interface Pg { label: string; file?: string; img?: string | null; ar?: string | null }

function parseCid(url: string, fallbackName?: string): { cid: string; entry: string } {
  let r = url || ''
  if (r.startsWith('ipfs://')) r = r.slice(7)
  else { const m = r.match(/\/ipfs\/(.+)$/); if (m) r = m[1] }
  r = r.replace(/^\/+/, '')
  // Try the normal "first path segment = CID" shape.
  const s = r.indexOf('/')
  let cid = s === -1 ? r : r.slice(0, s)
  let entry = s === -1 ? 'index.html' : (r.slice(s + 1) || 'index.html')
  // If that doesn't look like a real IPFS CID, hunt for one anywhere in the URL.
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{50,})$/.test(cid)) {
    const m = (url || '').match(/(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{50,})/)
    if (m) { cid = m[1]; entry = 'index.html' }
  }
  // Still nothing usable? Synthesize a stable alphanumeric key from the NFT
  // name with the trailing mint number stripped — so every mint of the same
  // comic type (e.g. "AW0 Starblind #267", "#268") collapses to the SAME key
  // ("lwaw0starblind") and shares fallback pages. The server auto-migrates
  // data that was previously stored under the per-mint key.
  if (!/^[A-Za-z0-9]+$/.test(cid)) {
    const stripped = (fallbackName || '').replace(/\s*#?\s*\d+\s*$/, '').trim()
    const seed = (stripped || url || 'comic').toLowerCase()
    cid = 'lw' + seed.replace(/[^a-z0-9]+/g, '').slice(0, 46) || 'lwcomic'
    entry = 'index.html'
  }
  return { cid, entry }
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

const notWebp = (f?: string) => !!f && !/\.webp$/i.test(f)

// Vercel serverless functions cap multipart bodies at ~4.5 MB. We aim well
// under that with a 2048px long-side cap + quality 0.85 (still very good
// for comic pages). Large source files get downscaled, not rejected.
const MAX_DIM = 2048
const WEBP_QUALITY = 0.85

function drawScaled(bmp: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  let outW = w, outH = h
  if (Math.max(w, h) > MAX_DIM) {
    const r = MAX_DIM / Math.max(w, h)
    outW = Math.round(w * r); outH = Math.round(h * r)
  }
  const c = document.createElement('canvas'); c.width = outW; c.height = outH
  c.getContext('2d')!.drawImage(bmp, 0, 0, outW, outH)
  return c
}

async function fileToWebp(file: File): Promise<File> {
  // Already small + already webp = nothing to do.
  if (file.type === 'image/webp' && file.size < 3 * 1024 * 1024) return file
  const bmp = await createImageBitmap(file)
  const c = drawScaled(bmp, bmp.width, bmp.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/webp', WEBP_QUALITY))
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

async function urlToWebp(url: string, baseName: string): Promise<File> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => res(im); im.onerror = () => rej(new Error('image load failed (CORS?)')); im.src = url
  })
  const c = drawScaled(img, img.naturalWidth, img.naturalHeight)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/webp', WEBP_QUALITY))
  return new File([blob], baseName.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

/**
 * Right-click page action menu. Renders off-screen first to measure its real
 * size, then clamps left/top so the whole menu fits inside the viewport with
 * an 8px margin — never gets cut off no matter how long the page label is.
 */
function PageContextMenu(props: {
  ctx: { x: number; y: number; index: number }
  pageLabel: string
  hasNonWebp: boolean
  onClose: () => void
  onReplace: () => void
  onInsertBefore: () => void
  onInsertAfter: () => void
  onRename: () => void
  onConvert: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    const r = ref.current
    if (!r) return
    const w = r.offsetWidth
    const h = r.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: Math.max(8, Math.min(props.ctx.x, vw - w - 8)),
      top: Math.max(8, Math.min(props.ctx.y, vh - h - 8)),
    })
  }, [props.ctx.x, props.ctx.y, props.ctx.index])

  const items: { label: string; fn: () => void; danger?: boolean }[] = [
    { label: 'Replace current image', fn: props.onReplace },
    { label: 'Insert before',         fn: props.onInsertBefore },
    { label: 'Insert after',          fn: props.onInsertAfter },
    { label: 'Rename page',           fn: props.onRename },
  ]
  if (props.hasNonWebp) items.push({ label: 'Convert to WEBP', fn: props.onConvert })
  items.push({ label: 'Delete page', fn: props.onDelete, danger: true })

  return (
    <div ref={ref} onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,    // measure off-screen first
        top:  pos?.top  ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 10001, background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)',
        borderRadius: 8, padding: 0, minWidth: 200, maxWidth: 280, boxShadow: '0 8px 24px rgba(0,0,0,.5)',
      }}>
      {/* Header: page label, truncated if long. Action items stay short. */}
      <div style={{
        padding: '.5rem .75rem', borderBottom: '1px solid rgba(255,255,255,.08)',
        color: '#bab1a8', fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{props.pageLabel || '(unnamed)'}</div>
      {items.map(({ label, fn, danger }) => (
        <button key={label} onClick={() => { props.onClose(); fn() }}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '.5rem .75rem', background: 'none', border: 'none',
            color: danger ? '#ff6b6b' : '#fff', fontSize: '.82rem', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

interface ModalState {
  kind: 'prompt' | 'confirm' | 'alert'
  title?: string
  message: string
  initial?: string
  okText?: string
  cancelText?: string
  danger?: boolean
  resolve: (v: string | boolean | null) => void
}

export function ComicReader(
  { name, url, onClose, isAdmin = false, coverUrl = null }:
  { name: string; url: string; onClose: () => void; isAdmin?: boolean; coverUrl?: string | null },
) {
  const { cid, entry } = parseCid(url, name)

  const [phase, setPhase] = useState<'resolving' | 'ready' | 'unavailable'>('resolving')
  const [reason, setReason] = useState('')
  const [pages, setPages] = useState<Pg[]>([])
  const [ipfsEntry, setIpfsEntry] = useState<string | null>(null)
  const [mode, setMode] = useState<'image' | 'interactive'>('image')
  const [admin, setAdmin] = useState(isAdmin)
  const [narrow, setNarrow] = useState(false)
  const [sIdx, setSIdx] = useState(0)
  const [display, setDisplay] = useState<{ label: string; img: string; ar: string }[]>([])
  const [anim, setAnim] = useState<'none' | 'next' | 'prev'>('none')
  const [failed, setFailed] = useState(false)
  const [perGroup, setPerGroup] = useState(10)
  const [ctx, setCtx] = useState<{ x: number; y: number; index: number } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [gsel, setGsel] = useState<Set<number>>(new Set())
  // Grid right-click preview: full-size image overlay with ‹ › cycling.
  const [preview, setPreview] = useState<number | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Zoom: 1 = normal. Pan (x, y) is the translate applied before the scale,
  // with transform-origin = top-left. Wheel = 2% per tick, anchored at cursor;
  // touch = standard pinch-to-zoom anchored at the finger midpoint.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const zoomBoxRef = useRef<HTMLDivElement>(null)
  const pinch = useRef<{ d0: number; z0: number; px0: number; py0: number; mx: number; my: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<{ mode: string; index: number } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  // After an upload completes, jump to the spread containing this page index.
  const navTarget = useRef<number | null>(null)

  const ask = useMemo(() => ({
    prompt: (message: string, initial = '', title?: string) =>
      new Promise<string | null>(resolve => { setModalInput(initial); setModal({ kind: 'prompt', message, initial, title, resolve: v => resolve(v as string | null) }) }),
    confirm: (message: string, opts: { okText?: string; danger?: boolean; title?: string } = {}) =>
      new Promise<boolean>(resolve => { setModal({ kind: 'confirm', message, ...opts, resolve: v => resolve(Boolean(v)) }) }),
    alert: (message: string, title?: string) =>
      new Promise<void>(resolve => { setModal({ kind: 'alert', message, title, resolve: () => resolve() }) }),
  }), [])

  const flashToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text })
    window.setTimeout(() => setToast(null), kind === 'ok' ? 2200 : 5000)
  }, [])

  // Book-flip uses sequential pair leaves (cover alone, then 2-up pairs,
  // optional trailing solo). Other effects use the user's solo-aware layout.
  const spreads = useMemo(
    () => PAGE_TURN_EFFECT === 'bookflip' ? buildLeafSpreads(pages.length, narrow) : buildSpreads(pages, narrow),
    [pages, narrow],
  )

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
    let fb: { name?: string; pages?: { label: string; file?: string; url?: string | null; ar?: string | null }[]; isAdmin?: boolean } | null = null
    let st = 0
    try { const r = await fetch(`/api/comic-pages?cid=${encodeURIComponent(cid)}`); st = r.status; if (r.ok) fb = await r.json() } catch { /* */ }
    if (fb?.isAdmin) setAdmin(true)
    setIpfsEntry(gw ? gw + entry : null)
    if (fb?.pages?.length) {
      // The NFT image IS the cover. Whenever a COVER slot has no uploaded
      // image, fall back to the NFT image at render time — no upload needed,
      // works on every comic, no CORS-on-upload to deal with.
      const isCoverSlot = (label: string, i: number) =>
        i === 0 || /^cover$|^front\s*cover$/i.test(label || '')
      setPages(fb.pages.map((p, i) => ({
        label: p.label,
        file: p.file,
        img: p.url ?? (coverUrl && isCoverSlot(p.label, i) ? coverUrl : null),
        ar: p.ar ?? null,
      })))
      setMode('image'); setSIdx(0); setPhase('ready'); return
    }
    if (gw) { setPages([{ label: name }]); setMode('interactive'); setSIdx(0); setPhase('ready'); return }
    setReason(st === 401 ? 'Sign in to read this comic.' : st === 403 ? 'You must own this NFT to read it.'
      : 'This comic isn’t available — no fallback configured and the IPFS copy is missing/unpinned.')
    setPhase('unavailable')
  }, [cid, entry, name, coverUrl])

  useEffect(() => { resolve() }, [resolve])

  const showSpread = useCallback((s: number) => {
    setDisplay(spreads[s]?.map(pi => ({ label: pages[pi].label, img: pages[pi].img || '', ar: pages[pi].ar || '' })) || [])
  }, [spreads, pages])

  // First render / after data or layout changes. If an upload just queued a
  // target page index, jump the reader there so the just-uploaded page is
  // visible without the user hunting for it.
  useEffect(() => {
    if (phase === 'ready' && mode === 'image' && spreads.length) {
      if (navTarget.current != null) {
        const target = navTarget.current
        navTarget.current = null
        const s = spreads.findIndex(sp => sp.includes(target))
        if (s >= 0) { setSIdx(s); showSpread(s); return }
      }
      const clamped = Math.min(sIdx, spreads.length - 1)
      if (clamped !== sIdx) setSIdx(clamped)
      showSpread(clamped)
    }
  }, [phase, mode, spreads, sIdx, showSpread])

  const playFlip = () => { const a = audio.current; if (a) { try { a.currentTime = 0; a.play().catch(() => {}) } catch { /* */ } } }

  const go = useCallback((target: number, dir: 'next' | 'prev') => {
    if (mode !== 'image' || !spreads.length) return
    // Wrap-around: prev from the first spread → last; next past the last → first.
    let wrapped = target
    if (wrapped < 0) wrapped = spreads.length - 1
    else if (wrapped >= spreads.length) wrapped = 0
    if (wrapped === sIdx) return
    setFailed(false)
    const commit = () => {
      setSIdx(wrapped); showSpread(wrapped); setAnim(dir); playFlip()
      // No reset timeout — ComicPageTurn keys on sIdx and runs its own
      // CSS animation duration. The `anim` value is kept only as the
      // "most recent direction" hint passed to the effect.
    }
    const real = spreads[wrapped].map(pi => pages[pi]?.img || '').filter(Boolean)
    if (real.length === 0) { commit(); return }   // unconfigured pages → placeholders, not an error
    Promise.all(real.map(u => new Promise<void>((res, rej) => { const im = new Image(); im.onload = () => res(); im.onerror = () => rej(); im.src = u })))
      .then(commit)
      .catch(() => { commit(); setFailed(true) })
  }, [mode, spreads, sIdx, pages, showSpread])

  const spreadOf = (pageIndex: number) => spreads.findIndex(sp => sp.includes(pageIndex))

  // ── Zoom (wheel + pinch + drag-pan), click to reset ──
  // Reset zoom on mode/spread change so each view starts at 1×.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [sIdx, mode])

  // Refs mirror zoom/pan so the (stable) native event listeners always read
  // the latest values without the effect having to re-bind on every change.
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  useEffect(() => { zoomRef.current = zoom; panRef.current = pan }, [zoom, pan])

  useEffect(() => {
    const el = zoomBoxRef.current
    if (!el || mode !== 'image') return

    const clamp = (n: number) => Math.max(1, Math.min(5, n))
    const apply = (nz: number, nx: number, ny: number) => {
      if (nz === 1) { nx = 0; ny = 0 }
      zoomRef.current = nz
      panRef.current = { x: nx, y: ny }
      setZoom(nz); setPan({ x: nx, y: ny })
    }
    const zoomAround = (cx: number, cy: number, nz: number) => {
      nz = clamp(nz); if (nz === zoomRef.current) return
      const z = zoomRef.current, p = panRef.current
      const wx = (cx - p.x) / z, wy = (cy - p.y) / z
      apply(nz, cx - wx * nz, cy - wy * nz)
    }

    // ── Wheel (mouse/trackpad): 4% per tick, anchored at cursor.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAround(e.clientX - r.left, e.clientY - r.top, zoomRef.current + (e.deltaY < 0 ? 0.04 : -0.04))
    }

    // ── Mouse drag-to-pan (only when already zoomed).
    let mDrag: { sx: number; sy: number; px0: number; py0: number; moved: boolean } | null = null
    let suppressClickUntil = 0
    const onMouseDown = (e: MouseEvent) => {
      if (zoomRef.current <= 1 || e.button !== 0) return
      e.preventDefault()
      mDrag = { sx: e.clientX, sy: e.clientY, px0: panRef.current.x, py0: panRef.current.y, moved: false }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mDrag) return
      const dx = e.clientX - mDrag.sx, dy = e.clientY - mDrag.sy
      if (!mDrag.moved && Math.hypot(dx, dy) > 3) mDrag.moved = true
      if (mDrag.moved) {
        panRef.current = { x: mDrag.px0 + dx, y: mDrag.py0 + dy }
        setPan(panRef.current)
      }
    }
    const onMouseUp = () => {
      if (mDrag?.moved) suppressClickUntil = Date.now() + 200  // ignore the click that follows a drag
      mDrag = null
    }

    // ── Touch: 1-finger pan when zoomed, 2-finger pinch always.
    let tPan: { sx: number; sy: number; px0: number; py0: number; moved: boolean } | null = null
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1]
        const r = el.getBoundingClientRect()
        pinch.current = {
          d0: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
          z0: zoomRef.current, px0: panRef.current.x, py0: panRef.current.y,
          mx: (t1.clientX + t2.clientX) / 2 - r.left,
          my: (t1.clientY + t2.clientY) / 2 - r.top,
        }
        tPan = null
      } else if (e.touches.length === 1 && zoomRef.current > 1) {
        const t = e.touches[0]
        tPan = { sx: t.clientX, sy: t.clientY, px0: panRef.current.x, py0: panRef.current.y, moved: false }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      const s = pinch.current
      if (e.touches.length === 2 && s) {
        e.preventDefault()
        const t1 = e.touches[0], t2 = e.touches[1]
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
        const nz = clamp(s.z0 * (d / s.d0))
        const wx = (s.mx - s.px0) / s.z0, wy = (s.my - s.py0) / s.z0
        apply(nz, s.mx - wx * nz, s.my - wy * nz)
      } else if (e.touches.length === 1 && tPan) {
        e.preventDefault()
        const t = e.touches[0]
        const dx = t.clientX - tPan.sx, dy = t.clientY - tPan.sy
        if (!tPan.moved && Math.hypot(dx, dy) > 5) tPan.moved = true
        if (tPan.moved) {
          panRef.current = { x: tPan.px0 + dx, y: tPan.py0 + dy }
          setPan(panRef.current)
        }
      }
    }
    const onTouchEnd = () => {
      if (tPan?.moved) suppressClickUntil = Date.now() + 200
      pinch.current = null; tPan = null
    }

    // ── Click resets to 1× (unless a drag/pinch just happened, or zoom=1).
    const onClick = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntil) { e.stopPropagation(); return }
      if (zoomRef.current > 1) { e.stopPropagation(); apply(1, 0, 0) }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('click', onClick, true)  // capture-phase: beat the book-flip click
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('click', onClick, true)
    }
    // phase / gridOpen must be deps too — they decide whether the zoom box
    // is actually in the DOM, and without them the effect runs once with a
    // null ref (phase='resolving' at mount) and listeners never attach.
  }, [mode, phase, gridOpen])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modal) { const m = modal; setModal(null); m.resolve(m.kind === 'prompt' ? null : false); return }
        if (preview !== null) { setPreview(null); return }
        if (ctx) { setCtx(null); return }
        onClose()
      }
      else if (modal) return  // arrow keys shouldn't flip pages while typing in the modal
      else if (preview !== null) {
        // Cycle the grid preview with wrap-around — same gesture as the
        // reader's prev/next.
        if (e.key === 'ArrowRight') setPreview((preview + 1) % pages.length)
        else if (e.key === 'ArrowLeft') setPreview((preview - 1 + pages.length) % pages.length)
      }
      else if (e.key === 'ArrowRight') go(sIdx + 1, 'next')
      else if (e.key === 'ArrowLeft') go(sIdx - 1, 'prev')
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, go, sIdx, ctx, modal, preview, pages.length])

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
  // Read a non-OK response and turn it into a useful error message even when
  // the body isn't JSON (Vercel timeouts and body-limit errors return HTML).
  const errFromResponse = async (r: Response): Promise<string> => {
    const txt = await r.text().catch(() => '')
    try { const j = JSON.parse(txt); if (j?.error) return String(j.error) } catch { /* not json */ }
    if (txt && txt.length < 500) return txt
    if (r.status === 413) return 'File too large for upload (the request exceeds the 4.5 MB server limit). Try a smaller image.'
    return `HTTP ${r.status}`
  }

  const rename = async (i: number) => {
    const cur = pages[i]
    const next = await ask.prompt(`Rename page "${cur.label}":`, cur.label, 'Rename page')
    if (next == null || next === cur.label) return
    const updated = pages.map((p, k) => k === i ? { ...p, label: next } : p)
    setPages(updated)
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, pages: updated.map(p => ({ label: p.label, file: p.file || '' })) }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      flashToast('ok', `Renamed to "${next}"`)
    } catch (e) { setPages(pages); flashToast('err', 'Rename failed: ' + (e instanceof Error ? e.message : String(e))) }
  }
  const makeFallback = async () => {
    const tpl = FALLBACK_TEMPLATE.map(l => ({ label: l, file: '' }))
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, name, pages: tpl }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      await resolve()  // cover slot will auto-render the NFT image (see resolve()).
      flashToast('ok', 'Fallback template created')
    } catch (e) { await ask.alert(`Could not create fallback (cid="${cid}"): ` + (e instanceof Error ? e.message : String(e)), 'Make fallback failed') }
  }
  const startUpload = (m: 'replace' | 'before' | 'after', index: number) => {
    pending.current = { mode: m, index }
    fileRef.current?.click()
  }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []); const job = pending.current
    e.target.value = ''
    if (!list.length || !job) return
    // Always convert to a sensibly-sized WEBP. (Server only accepts <4.5 MB
    // multipart bodies on Vercel; the converter caps at 2048px / q0.85.)
    let files = list
    const nonWebp = list.filter(f => f.type !== 'image/webp')
    const tooBig = list.some(f => f.size > 3 * 1024 * 1024)
    if (nonWebp.length || tooBig) {
      const ok = await ask.confirm(
        `${nonWebp.length || list.length} file(s) will be ${nonWebp.length ? 'converted to WEBP and ' : ''}resized to fit (max 2048px). Continue?`,
        { okText: 'Convert & upload', title: 'Prepare images' },
      )
      if (!ok) return
      files = await Promise.all(list.map(f => fileToWebp(f).catch(() => f)))
    }
    // For multi-file inserts/appends, switch to 'fill' mode so the server
    // first fills any empty slots (keeping their existing labels), then
    // inserts only the overflow as new pages — and auto-renumbers any
    // numeric labels that come after.
    const isMultiInsert = files.length > 1 && job.mode !== 'replace'
    const serverMode = isMultiInsert ? 'fill' : job.mode
    const serverIndex = isMultiInsert
      ? (job.mode === 'after' ? job.index + 1 : job.mode === 'before' ? job.index : pages.length)
      : job.index
    const fd = new FormData()
    fd.append('cid', cid); fd.append('mode', serverMode); fd.append('index', String(serverIndex))
    if (files.length === 1) {
      const dft = job.mode === 'replace' ? (pages[job.index]?.label || 'PAGE') : 'PAGE'
      const label = await ask.prompt('Page label (e.g. COVER, L1, 1, AD1, BC):', dft, 'Page label')
      if (label == null) return
      fd.append('label', label)
    } else if (job.mode === 'replace') {
      // Multi-file replace: keep the existing page labels at each slot being
      // overwritten. The source filename is irrelevant to the comic's page name.
      files.forEach((_, i) => {
        const existing = pages[job.index + i]?.label
        fd.append('label', existing || `PAGE ${job.index + i + 1}`)
      })
    } else {
      // Multi-file fill/insert: empty slots keep their labels server-side; only
      // the overflow uses these. Ask for a base label and number sequentially.
      const baseRaw = await ask.prompt(
        `Label for any uploads that overflow past empty slots (existing empties keep their labels). "P" → P1, P${files.length}; blank → 1, ${files.length}:`,
        '',
        `Label ${files.length} pages`,
      )
      if (baseRaw == null) return
      const base = baseRaw.trim()
      files.forEach((_, i) => fd.append('label', `${base}${i + 1}`))
    }
    files.forEach(f => fd.append('file', f))
    try {
      const r = await fetch('/api/comics/upload', { method: 'POST', body: fd })
      if (!r.ok) throw new Error(await errFromResponse(r))
      // Compute where the just-uploaded content will sit after the server
      // applies the mode, then queue a jump so the reader shows it next.
      const insertAt = isMultiInsert ? serverIndex
        : job.mode === 'replace' ? job.index
        : job.mode === 'before' ? job.index
        : job.mode === 'after' ? job.index + 1
        : pages.length
      navTarget.current = insertAt
      setGsel(new Set())
      await resolve()
      flashToast('ok', files.length === 1 ? 'Page uploaded' : `${files.length} pages uploaded`)
    } catch (err) { await ask.alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)), 'Upload failed') }
  }

  const del = async (idxs: number[]) => {
    const listed = [...new Set(idxs)].sort((a, b) => a - b)
    if (!listed.length) return
    const ok = await ask.confirm(`Delete ${listed.length} page(s)? This cannot be undone.`, { okText: 'Delete', danger: true, title: 'Confirm delete' })
    if (!ok) return
    const set = new Set(listed)
    const deleteFiles = listed.map(i => pages[i]?.file).filter(Boolean)
    const next = pages.filter((_, k) => !set.has(k)).map(p => ({ label: p.label, file: p.file || '' }))
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, pages: next, deleteFiles }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      setGsel(new Set()); await resolve()
      flashToast('ok', `${listed.length} page(s) deleted`)
    } catch (e) { await ask.alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)), 'Delete failed') }
  }

  const backfillArweave = async () => {
    const ok = await ask.confirm('Permanently mirror this comic’s fallback pages to Arweave? Requires TURBO_ETH_KEY or ARWEAVE_JWK to be configured.', { okText: 'Mirror to Arweave', title: 'Arweave backup' })
    if (!ok) return
    try {
      const r = await fetch('/api/comics/arweave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, variant: 'full' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      await ask.alert(`Arweave: ${j.uploaded} uploaded, ${j.skipped} skipped` + (j.errors?.length ? `, ${j.errors.length} error(s)` : ''), 'Arweave backup complete')
      await resolve()
    } catch (e) { await ask.alert('Arweave backup: ' + (e instanceof Error ? e.message : String(e)), 'Arweave backup failed') }
  }
  const convertExisting = async (i: number) => {
    const p = pages[i]
    if (!p.img || !p.file) { await ask.alert('No image to convert.', 'Convert'); return }
    try {
      const wf = await urlToWebp(p.img, p.file)
      const fd = new FormData()
      fd.append('cid', cid); fd.append('mode', 'replace'); fd.append('index', String(i))
      fd.append('label', p.label); fd.append('file', wf)
      const r = await fetch('/api/comics/upload', { method: 'POST', body: fd })
      if (!r.ok) throw new Error(await errFromResponse(r))
      navTarget.current = i
      await resolve()
      flashToast('ok', `Converted "${p.label}" to WEBP`)
    } catch (err) { await ask.alert('Convert failed (image CORS?): ' + (err instanceof Error ? err.message : String(err)), 'Convert failed') }
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
    // Square, 20% narrower than the old 46px (→ 37px). The ‹ › glyphs sit a
    // few pixels below the typographic center, so an extra paddingBottom
    // shifts the flex-centered content up to land in the visual middle.
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '10px', zIndex: 6,
    background: 'var(--lw-purple, #6a24fa)', color: '#fff', border: 'none', width: 37, height: 37,
    borderRadius: 8, cursor: 'pointer', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 4,
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: 0.9,
  })
  const msg: React.CSSProperties = { position: 'absolute', inset: 0, background: '#111111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '2rem' }

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#111111', borderRadius: 12, width: 'min(1200px,96vw)', height: '95vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, zIndex: 8, background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>&#x2715;</button>
        {ipfsEntry && pages.some(p => p.img) && (
          <button onClick={() => setMode(m => m === 'image' ? 'interactive' : 'image')}
            style={{ position: 'absolute', top: 8, left: 8, zIndex: 8, ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}>
            {mode === 'image' ? 'Interactive (IPFS)' : 'Page images'}
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFile} />

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
          {phase === 'ready' && mode === 'image' && !gridOpen && (
            <>
              {/* Zoom layer. Wheel/pinch/drag/click handled by the useEffect
                  on zoomBoxRef. Book-flip is ALWAYS mounted but display:none'd
                  when zoomed — unmounting it mid-paint leaves its GPU
                  compositor leaves visible for a frame, which is the angled
                  chopping artifact you saw. The flat scaled view renders on
                  top while zoomed; nesting scale() inside book-flip's 3D
                  perspective would collapse the stack into overlapping
                  fragments, so the flat view is what scales. */}
              <div ref={zoomBoxRef}
                style={{ position: 'absolute', inset: 0, zIndex: zoom > 1 ? 100 : 1,
                  cursor: zoom > 1 ? 'grab' : 'default',
                  touchAction: zoom > 1 ? 'none' : 'auto' }}>
                <div style={{ position: 'absolute', inset: 0, display: zoom > 1 ? 'none' : 'block' }}>
                  <ComicPageTurn
                    display={display}
                    name={name}
                    spreadKey={sIdx}
                    direction={anim}
                    onImageFailed={() => setFailed(true)}
                    admin={admin}
                    effect={PAGE_TURN_EFFECT}
                    allPages={pages.map(pg => ({ label: pg.label, img: pg.img || '', ar: pg.ar || '' }))}
                    currentLeaf={sIdx}
                    narrow={narrow}
                    onPageAdvance={dir => go(dir === 'next' ? sIdx + 1 : sIdx - 1, dir)}
                  />
                </div>
                {zoom > 1 && (
                  <div style={{
                    position: 'absolute', inset: 0, background: '#111111',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    transition: pinch.current ? 'none' : 'transform 80ms linear',
                    willChange: 'transform',
                    display: 'flex', gap: display.length > 1 ? '4px' : 0,
                  }}>
                    {display.map((d, i) => d.img ? (
                      <img key={i} src={d.img} alt={`${name} — ${d.label}`} draggable={false}
                        style={{ flex: 1, minWidth: 0, height: '100%', objectFit: 'contain', background: '#111111', userSelect: 'none', pointerEvents: 'none' }} />
                    ) : (
                      <div key={i} style={{ flex: 1, minWidth: 0, height: '100%', background: '#161616' }} />
                    ))}
                  </div>
                )}
              </div>
              {zoom === 1 && sIdx > 0 && <button style={floatBtn('left')} title="Previous" onClick={() => go(sIdx - 1, 'prev')}>&#8249;</button>}
              {zoom === 1 && sIdx < spreads.length - 1 && <button style={floatBtn('right')} title="Next" onClick={() => go(sIdx + 1, 'next')}>&#8250;</button>}
              {failed && (
                <div style={{ ...msg, zIndex: 5 }}>
                  <p style={{ color: '#e4dad1', fontSize: '.95rem', margin: 0 }}>This page didn&apos;t load.</p>
                  <p style={{ color: '#7a7572', fontSize: '.8rem', margin: 0 }}>The image may be missing for this comic, or the signed link expired.</p>
                  <button style={{ ...sel, marginTop: '.5rem' }} onClick={resolve}>Reload</button>
                </div>
              )}
            </>
          )}
          {phase === 'ready' && mode === 'image' && gridOpen && (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: '#111111', padding: '.75rem' }}>
              {gsel.size > 0 && (
                <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: '.5rem', alignItems: 'center', background: '#0b0b0b', padding: '.4rem .5rem', marginBottom: '.5rem', borderRadius: 6 }}>
                  <span style={{ color: '#bab1a8', fontSize: '.72rem' }}>{gsel.size} selected</span>
                  <button style={sel} title="Insert files before the first selected page" onClick={() => startUpload('before', Math.min(...Array.from(gsel)))}>Insert files here&hellip;</button>
                  <button style={{ ...sel, background: '#b3324a' }} onClick={() => del([...gsel])}>Delete ({gsel.size})</button>
                  <button style={btn} onClick={() => setGsel(new Set())}>Clear</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '.6rem' }}>
                {pages.map((p, i) => (
                  <div key={i}
                    onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) setGsel(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }); else setCtx({ x: e.clientX, y: e.clientY, index: i }) }}
                    onContextMenu={e => { e.preventDefault(); setPreview(i) }}
                    style={{ cursor: 'pointer', borderRadius: 6, overflow: 'hidden', background: '#1a1a1c', outline: gsel.has(i) ? '2px solid var(--lw-purple,#6a24fa)' : '2px solid transparent' }}>
                    <div style={{ aspectRatio: '5 / 7', background: '#0d0d0d', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.img ? <img src={p.img} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#555', fontSize: '.7rem' }}>no image</span>}
                    </div>
                    <div style={{ padding: '.35rem .4rem' }}>
                      <div style={{ color: '#fff', fontWeight: 700, fontSize: '.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                      <div style={{ color: '#7a7572', fontSize: '.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>- {p.file || '(none)'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', padding: '.4rem .6rem', background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <span style={{ color: '#7a7572', fontSize: '.62rem', whiteSpace: 'nowrap', marginRight: '.2rem', flexShrink: 0 }}>
            {navOk ? `${(spreads[sIdx] || []).map(p => pages[p]?.label).join(' / ')} · ${sIdx + 1}/${spreads.length}` : mode === 'interactive' ? 'Interactive comic' : 'Pages'}
          </span>
          <button style={{ ...btn, flexShrink: 0 }} title="First" onClick={() => go(0, 'prev')} disabled={!navOk || sIdx === 0}>|&lsaquo;</button>
          <button style={{ ...nav, flexShrink: 0 }} title="Previous (wraps)" onClick={() => go(sIdx - 1, 'prev')} disabled={!navOk}>&#8249;</button>
          {groups > 1 && navOk && <button style={{ ...btn, flexShrink: 0 }} title="Prev group" onClick={() => go(spreadOf(Math.max(gStart - perGroup, 0)), 'prev')} disabled={group === 0}>&laquo;</button>}
          {navOk && Array.from({ length: gEnd - gStart }, (_, i) => gStart + i).map(p => (
            <button key={p} style={{ ...(activeSet.has(p) ? sel : btn), flexShrink: 0, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={admin ? `${pages[p].label} — right-click for upload / insert / rename` : pages[p].label}
              onContextMenu={admin ? (e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, index: p }) }) : undefined}
              onClick={() => { const s = spreadOf(p); if (s >= 0) go(s, s > sIdx ? 'next' : 'prev') }}>
              {pages[p].label}
            </button>
          ))}
          {groups > 1 && navOk && <button style={{ ...btn, flexShrink: 0 }} title="Next group" onClick={() => go(spreadOf(Math.min(gStart + perGroup, total - 1)), 'next')} disabled={group >= groups - 1}>&raquo;</button>}
          <button style={{ ...nav, flexShrink: 0 }} title="Next (wraps)" onClick={() => go(sIdx + 1, 'next')} disabled={!navOk}>&#8250;</button>
          <button style={{ ...btn, flexShrink: 0 }} title="Last" onClick={() => go(spreads.length - 1, 'next')} disabled={!navOk || sIdx >= spreads.length - 1}>&rsaquo;|</button>
          {admin && navOk && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '.25rem' }}>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Toggle admin page grid" onClick={() => { setGridOpen(g => !g); setGsel(new Set()) }}>{gridOpen ? 'Reader' : 'Grid'}</button>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Add page(s) at the end" onClick={() => startUpload('after', total - 1)}>+ Page</button>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Mirror all pages to Arweave (permanent double-fallback)" onClick={backfillArweave}>Arweave</button>
            </span>
          )}
          {admin && phase === 'ready' && mode === 'interactive' && (
            <button style={{ ...sel, marginLeft: 'auto', fontWeight: 700 }}
              title="Create an editable fallback page template for this comic" onClick={makeFallback}>MAKE FALLBACK</button>
          )}
        </div>
      </div>

      {ctx && admin && (
        <PageContextMenu
          ctx={ctx}
          pageLabel={pages[ctx.index]?.label ?? ''}
          hasNonWebp={notWebp(pages[ctx.index]?.file)}
          onClose={() => setCtx(null)}
          onReplace={() => startUpload('replace', ctx.index)}
          onInsertBefore={() => startUpload('before', ctx.index)}
          onInsertAfter={() => startUpload('after', ctx.index)}
          onRename={() => rename(ctx.index)}
          onConvert={() => convertExisting(ctx.index)}
          onDelete={() => del([ctx.index])}
        />
      )}

      {/* Grid right-click preview: full-size image, purple glow, click anywhere
          to close, ‹ › or arrow keys cycle through pages with wrap-around. */}
      {preview !== null && pages[preview] && (
        <div onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,.92)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          {pages[preview].img ? (
            <img src={pages[preview].img} alt={pages[preview].label} draggable={false}
              style={{
                maxWidth: '92%', maxHeight: '92%', objectFit: 'contain', borderRadius: 4,
                boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)',
                userSelect: 'none', pointerEvents: 'none',
              }} />
          ) : (
            <div style={{ color: '#7a7572', fontSize: '1rem', padding: '2rem', textAlign: 'center' }}>
              &ldquo;{pages[preview].label}&rdquo; — no image yet
            </div>
          )}
          <button title="Previous (wraps)"
            onClick={e => { e.stopPropagation(); setPreview((preview - 1 + pages.length) % pages.length) }}
            style={floatBtn('left')}>&#8249;</button>
          <button title="Next (wraps)"
            onClick={e => { e.stopPropagation(); setPreview((preview + 1) % pages.length) }}
            style={floatBtn('right')}>&#8250;</button>
          <div style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', color: '#bab1a8', fontSize: '.8rem', background: 'rgba(0,0,0,.5)', padding: '.3rem .8rem', borderRadius: 6, pointerEvents: 'none' }}>
            {pages[preview].label} · {preview + 1}/{pages.length}
          </div>
        </div>
      )}

      {/* In-app modal — replaces window.prompt / confirm / alert */}
      {modal && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form
            onSubmit={e => { e.preventDefault(); const m = modal; setModal(null); m.resolve(m.kind === 'prompt' ? modalInput : true) }}
            style={{ background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)', borderRadius: 12, padding: '1.25rem', minWidth: 'min(440px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }}>
            {modal.title && <h3 style={{ color: '#fff', margin: '0 0 .6rem', fontSize: '1rem', fontWeight: 700 }}>{modal.title}</h3>}
            <p style={{ color: '#e4dad1', margin: '0 0 1rem', fontSize: '.9rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{modal.message}</p>
            {modal.kind === 'prompt' && (
              <input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)}
                style={{ width: '100%', background: '#0b0b0b', border: '1px solid rgba(255,255,255,.15)', color: '#fff', padding: '.55rem .7rem', borderRadius: 6, fontSize: '.95rem', marginBottom: '1rem', boxSizing: 'border-box' }} />
            )}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {modal.kind !== 'alert' && (
                <button type="button" onClick={() => { const m = modal; setModal(null); m.resolve(m.kind === 'prompt' ? null : false) }}
                  style={{ ...btn, padding: '.5rem 1rem', fontSize: '.85rem', background: 'rgba(255,255,255,.08)' }}>
                  {modal.cancelText || 'Cancel'}
                </button>
              )}
              <button type="submit" autoFocus={modal.kind !== 'prompt'}
                style={{ ...sel, padding: '.5rem 1rem', fontSize: '.85rem', background: modal.danger ? '#b3324a' : 'var(--lw-purple, #6a24fa)' }}>
                {modal.okText || (modal.kind === 'alert' ? 'OK' : modal.kind === 'confirm' ? 'OK' : 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* In-portal toast (success / error) */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10003,
          background: toast.kind === 'ok' ? 'rgba(46,160,67,.95)' : 'rgba(179,50,74,.95)',
          color: '#fff', padding: '.6rem 1rem', borderRadius: 8, fontSize: '.85rem', maxWidth: '90vw',
          boxShadow: '0 6px 18px rgba(0,0,0,.45)' }}>
          {toast.text}
        </div>
      )}
    </div>,
    document.body,
  )
}
