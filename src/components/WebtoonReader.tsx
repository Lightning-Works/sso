'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * WebtoonReader — LightningWorks vertical-scroll comic reader.
 *
 * The webtoon counterpart to ComicReader. Where ComicReader shows a
 * paged book with 2-up spreads, this stacks tall "strip" images in one
 * continuous downward scroll at a fixed reading width.
 *
 * Strips are grouped into SECTIONS by a per-strip `section` field. A
 * section is a run of consecutive strips with the same section value —
 * episodes ("E1", "E2") and one-offs ("Cover", "Interview") are the
 * same mechanism, just named differently. The right-side nav has one
 * button per section; clicking jumps to the top of that section.
 *
 * Shares the storage backend, cid scheme, tier system, and admin API
 * with ComicReader (/api/comic-pages, /api/comics, /api/comics/upload,
 * /api/comics/arweave, /api/comics/tiers). Same purple LW chrome.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { parseCid } from './ComicReader'

interface Strip {
  label: string
  file?: string
  img?: string | null
  ar?: string | null
  tier?: string | null
  section?: string | null
}

// Tier rank — identical scheme to ComicReader. The real list is fetched
// per-contract from /api/comics/tiers; this is the fallback.
const CANONICAL_RANK: Record<string, number> = {
  base: 0, common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
  divine: 5, mystic: 6, rainbow: 7, apocalyptic: 8,
}
const CANONICAL_LABELS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Divine', 'Mystic', 'Rainbow', 'Apocalyptic']

function rankIn(tier: string | null | undefined, rankMap: Record<string, number>): number {
  if (!tier) return 0
  return rankMap[tier.toLowerCase()] ?? 0
}

// Webtoon strips are tall. Cap WIDTH (not the long side, as the paged
// reader does) so vertical detail survives, and cap height to stay
// inside browser canvas limits. Files still must land under Vercel's
// ~4.5 MB upload-body cap — very tall strips may need splitting.
const READING_WIDTH = 720
const WEBTOON_MAX_W = 1600
const WEBTOON_MAX_H = 12000
const WEBP_QUALITY = 0.85
const FALLBACK_TEMPLATE: { label: string; section: string }[] = [
  { label: 'Cover', section: 'Cover' },
  { label: 'E1', section: 'E1' },
]

const notWebp = (f?: string) => !!f && !/\.webp$/i.test(f)

function drawScaledWebtoon(bmp: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  let scale = 1
  if (w > WEBTOON_MAX_W) scale = WEBTOON_MAX_W / w
  if (h * scale > WEBTOON_MAX_H) scale = WEBTOON_MAX_H / h
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))
  const c = document.createElement('canvas'); c.width = outW; c.height = outH
  c.getContext('2d')!.drawImage(bmp, 0, 0, outW, outH)
  return c
}

async function fileToWebpWebtoon(file: File): Promise<File> {
  if (file.type === 'image/webp' && file.size < 3 * 1024 * 1024) return file
  const bmp = await createImageBitmap(file)
  const c = drawScaledWebtoon(bmp, bmp.width, bmp.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/webp', WEBP_QUALITY))
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

// If a single converted strip is still over the per-request cap, retry
// the WebP encode at a lower quality so it fits — vs. failing the upload.
async function reencodeWebtoonSmaller(file: File, targetMaxBytes: number): Promise<File> {
  for (const q of [0.65, 0.5]) {
    try {
      const bmp = await createImageBitmap(file)
      const c = drawScaledWebtoon(bmp, bmp.width, bmp.height)
      const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/webp', q))
      if (blob.size <= targetMaxBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
      }
    } catch { /* try next */ }
  }
  return file
}

interface ModalState {
  kind: 'prompt' | 'confirm' | 'alert'
  title?: string
  message: string
  initial?: string
  options?: { value: string; label: string }[]
  okText?: string
  cancelText?: string
  danger?: boolean
  resolve: (v: string | boolean | null) => void
}

/** Right-click action menu for a strip. Measures off-screen, then clamps
 *  into the viewport — mirrors ComicReader's PageContextMenu. */
function StripContextMenu(props: {
  ctx: { x: number; y: number; index: number }
  label: string
  tier?: string | null
  section?: string | null
  hasNonWebp: boolean
  onClose: () => void
  onReplace: () => void
  onInsertBefore: () => void
  onInsertAfter: () => void
  onRename: () => void
  onSetTier: () => void
  onSetSection: () => void
  onConvert: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    const r = ref.current
    if (!r) return
    setPos({
      left: Math.max(8, Math.min(props.ctx.x, window.innerWidth - r.offsetWidth - 8)),
      top: Math.max(8, Math.min(props.ctx.y, window.innerHeight - r.offsetHeight - 8)),
    })
  }, [props.ctx.x, props.ctx.y, props.ctx.index])

  const items: { label: string; fn: () => void; danger?: boolean }[] = [
    { label: 'Replace current image', fn: props.onReplace },
    { label: 'Insert before', fn: props.onInsertBefore },
    { label: 'Insert after', fn: props.onInsertAfter },
    { label: 'Rename strip', fn: props.onRename },
    { label: `Set episode/section…${props.section ? ` (${props.section})` : ''}`, fn: props.onSetSection },
    { label: `Set tier…${props.tier ? ` (${props.tier})` : ''}`, fn: props.onSetTier },
  ]
  if (props.hasNonWebp) items.push({ label: 'Convert to WEBP', fn: props.onConvert })
  items.push({ label: 'Delete strip', fn: props.onDelete, danger: true })

  return (
    <div ref={ref} onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 10001, background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)',
        borderRadius: 8, padding: 0, minWidth: 210, maxWidth: 300, boxShadow: '0 8px 24px rgba(0,0,0,.5)',
      }}>
      <div style={{
        padding: '.5rem .75rem', borderBottom: '1px solid rgba(255,255,255,.08)',
        color: '#bab1a8', fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{props.label || '(unnamed)'}</div>
      {items.map(({ label, fn, danger }) => (
        <button key={label} onClick={() => { props.onClose(); fn() }}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '.5rem .75rem', background: 'none', border: 'none',
            color: danger ? '#ff6b6b' : '#fff', fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// Inlined here to avoid type-import cycles (NftGrid → Dispatch → WebtoonReader).
type ReaderLoanState =
  | { kind: 'lent'; loanId: string; status: 'pending' | 'active'; toLabel: string; expiresAt: string }
  | { kind: 'borrowed'; loanId: string; fromLabel: string; expiresAt: string }

export function WebtoonReader(
  { name, url, onClose, isAdmin = false, coverUrl = null, contractAddress = null, tokenId = null, viewerTier = null, loanState = null, initialAction = null, onSwitchFormat, onLoansChanged }:
  {
    name: string; url: string; onClose: () => void; isAdmin?: boolean
    coverUrl?: string | null; contractAddress?: string | null; tokenId?: string | null
    viewerTier?: string | null
    loanState?: ReaderLoanState | null
    initialAction?: 'loan' | null
    onSwitchFormat?: (f: 'pages' | 'webtoon') => void
    onLoansChanged?: () => void
  },
) {
  // Loan flow params used by the bottom-bar LOAN/RETURN buttons. We
  // mark them void where unused so TS doesn't complain about unused
  // bindings until the webtoon-side loan UI is added in a follow-up.
  void tokenId; void loanState; void initialAction; void onLoansChanged
  const { cid } = parseCid(url, name, contractAddress || undefined)

  const [phase, setPhase] = useState<'resolving' | 'ready' | 'unavailable'>('resolving')
  const [reason, setReason] = useState('')
  const [strips, setStrips] = useState<Strip[]>([])
  const [admin, setAdmin] = useState(isAdmin)
  const [gridOpen, setGridOpen] = useState(false)
  const [gsel, setGsel] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<number | null>(null)
  const [activeSection, setActiveSection] = useState(0)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stripEls = useRef<(HTMLDivElement | null)[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<{ mode: 'replace' | 'before' | 'after'; index: number } | null>(null)
  // True while a mousedown/touchstart originated on the modal backdrop
  // itself — prevents drag-releases from synthesizing a close.
  const backdropDownRef = useRef(false)
  const [ctx, setCtx] = useState<{ x: number; y: number; index: number } | null>(null)

  // Tier inventory (discovered per-contract; see ComicReader for the scheme).
  const [tierNames, setTierNames] = useState<string[]>(CANONICAL_LABELS)
  const tierRank = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = { base: 0 }
    tierNames.forEach((n, i) => { m[n.toLowerCase()] = i })
    for (const [k, v] of Object.entries(CANONICAL_RANK)) {
      if (m[k] === undefined) m[k] = v + tierNames.length
    }
    return m
  }, [tierNames])
  const viewerRank = rankIn(viewerTier, tierRank)

  const ask = useMemo(() => ({
    prompt: (message: string, initial = '', title?: string) =>
      new Promise<string | null>(resolve => { setModalInput(initial); setModal({ kind: 'prompt', message, initial, title, resolve: v => resolve(v as string | null) }) }),
    select: (message: string, options: { value: string; label: string }[], initial?: string, title?: string) =>
      new Promise<string | null>(resolve => { setModalInput(initial ?? options[0]?.value ?? ''); setModal({ kind: 'prompt', message, initial: initial ?? options[0]?.value, options, title, resolve: v => resolve(v as string | null) }) }),
    confirm: (message: string, opts: { okText?: string; danger?: boolean; title?: string } = {}) =>
      new Promise<boolean>(resolve => { setModal({ kind: 'confirm', message, ...opts, resolve: v => resolve(Boolean(v)) }) }),
    alert: (message: string, title?: string) =>
      new Promise<void>(resolve => { setModal({ kind: 'alert', message, title, resolve: () => resolve() }) }),
  }), [])

  const flashToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text })
    window.setTimeout(() => setToast(null), kind === 'ok' ? 2200 : 5000)
  }, [])

  // Sections = runs of consecutive strips with the same `section` value.
  const sections = useMemo(() => {
    const out: { name: string; firstIndex: number; indices: number[] }[] = []
    strips.forEach((s, i) => {
      const nm = (s.section || '').trim() || 'Untitled'
      const last = out[out.length - 1]
      if (last && last.name === nm) last.indices.push(i)
      else out.push({ name: nm, firstIndex: i, indices: [i] })
    })
    return out
  }, [strips])

  // ── Discover tier inventory from the contract's on-chain attributes.
  useEffect(() => {
    if (!contractAddress) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/comics/tiers?contract=${encodeURIComponent(contractAddress)}`)
        if (!r.ok) return
        const j = await r.json() as { tiers?: { name: string; count: number }[] }
        if (cancelled) return
        const names = (j.tiers || []).map(t => t.name).filter(Boolean)
        if (names.length) setTierNames(names)
      } catch { /* keep canonical */ }
    })()
    return () => { cancelled = true }
  }, [contractAddress])

  const resolve = useCallback(async () => {
    setPhase('resolving')
    let fb: {
      name?: string; format?: string; isAdmin?: boolean
      pages?: { label: string; file?: string; url?: string | null; ar?: string | null; tier?: string | null; section?: string | null }[]
    } | null = null
    let st = 0
    try {
      const r = await fetch(`/api/comic-pages?cid=${encodeURIComponent(cid)}&name=${encodeURIComponent(name)}`)
      st = r.status
      if (r.ok) fb = await r.json()
    } catch { /* */ }
    // Self-correct: if this comic is actually a paged comic, hand back to
    // the dispatcher so it mounts ComicReader instead.
    if (fb?.format === 'pages') { onSwitchFormat?.('pages'); return }
    const isAdminNow = !!(fb?.isAdmin) || isAdmin
    if (fb?.isAdmin) setAdmin(true)
    if (fb?.pages?.length) {
      const isCoverSlot = (label: string, i: number) =>
        i === 0 || /^cover$|^front\s*cover$/i.test(label || '')
      const visible = isAdminNow
        ? fb.pages
        : fb.pages.filter(p => !p.tier || rankIn(p.tier, tierRank) <= viewerRank)
      setStrips(visible.map((p, i) => ({
        label: p.label,
        file: p.file,
        img: p.url ?? (coverUrl && isCoverSlot(p.label, i) ? coverUrl : null),
        ar: p.ar ?? null,
        tier: p.tier ?? null,
        section: p.section ?? null,
      })))
      setActiveSection(0)
      setPhase('ready')
      return
    }
    setReason(st === 401 ? 'Sign in to read this comic.' : st === 403 ? 'You must own this NFT to read it.'
      : 'This webtoon has no strips yet.')
    setPhase('unavailable')
  }, [cid, name, coverUrl, isAdmin, viewerRank, tierRank, onSwitchFormat])

  useEffect(() => { resolve() }, [resolve])

  // Active-section highlight: the last section whose first strip has
  // scrolled to (or above) the top of the viewport.
  const onScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    const top = sc.scrollTop + 80
    let active = 0
    sections.forEach((sec, si) => {
      const el = stripEls.current[sec.firstIndex]
      if (el && el.offsetTop <= top) active = si
    })
    setActiveSection(active)
  }, [sections])

  const jumpToSection = useCallback((sectionIdx: number) => {
    const sec = sections[sectionIdx]
    if (!sec) return
    stripEls.current[sec.firstIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sections])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modal) { const m = modal; setModal(null); m.resolve(m.kind === 'prompt' ? null : false); return }
        if (preview !== null) { setPreview(null); return }
        if (ctx) { setCtx(null); return }
        onClose()
      } else if (preview !== null && !modal) {
        if (e.key === 'ArrowRight') setPreview((preview + 1) % strips.length)
        else if (e.key === 'ArrowLeft') setPreview((preview - 1 + strips.length) % strips.length)
      }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose, modal, preview, ctx, strips.length])

  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctx])

  // ── Admin ──
  const errFromResponse = async (r: Response): Promise<string> => {
    const txt = await r.text().catch(() => '')
    try { const j = JSON.parse(txt); if (j?.error) return String(j.error) } catch { /* not json */ }
    if (txt && txt.length < 500) return txt
    if (r.status === 413) return 'File too large (exceeds the 4.5 MB server limit). Use a shorter strip or split it.'
    return `HTTP ${r.status}`
  }

  const patchStrips = async (next: Strip[], extra: Record<string, unknown> = {}) => {
    const r = await fetch('/api/comics', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid, nameHint: name,
        pages: next.map(p => ({ label: p.label, file: p.file || '', tier: p.tier || null, section: p.section || null })),
        ...extra,
      }),
    })
    if (!r.ok) throw new Error(await errFromResponse(r))
  }

  const makeFallback = async () => {
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, name, format: 'webtoon', pages: FALLBACK_TEMPLATE.map(t => ({ label: t.label, file: '', section: t.section })) }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      await resolve()
      flashToast('ok', 'Webtoon template created')
    } catch (e) { await ask.alert(`Could not create webtoon (cid="${cid}"): ` + (e instanceof Error ? e.message : String(e)), 'Failed') }
  }

  const startUpload = (mode: 'replace' | 'before' | 'after', index: number) => {
    pending.current = { mode, index }
    fileRef.current?.click()
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || [])
    const job = pending.current
    e.target.value = ''
    if (!list.length || !job) return

    // Step 1 — convert non-webp / oversize sources to WebP client-side.
    let files = list
    const nonWebp = list.filter(f => f.type !== 'image/webp')
    const tooBig = list.some(f => f.size > 3 * 1024 * 1024)
    if (nonWebp.length || tooBig) {
      const ok = await ask.confirm(
        `${list.length} strip(s) will be ${nonWebp.length ? 'converted to WEBP and ' : ''}sized to fit (max ${WEBTOON_MAX_W}px wide). Continue?`,
        { okText: 'Convert & upload', title: 'Prepare strips' },
      )
      if (!ok) return
      files = await Promise.all(list.map(f => fileToWebpWebtoon(f).catch(() => f)))
    }

    // Step 2 — section prompt.
    const nearSection = strips[job.index]?.section || sections[sections.length - 1]?.name || 'E1'
    const section = await ask.prompt(
      'Episode / section for these strip(s) — e.g. E1, E2, Cover, Interview:',
      job.mode === 'replace' ? (strips[job.index]?.section || nearSection) : nearSection,
      'Episode / section',
    )
    if (section == null) return
    const sec = section.trim() || 'E1'

    // Step 3 — re-encode any single file that's still over the per-request
    // cap (Vercel limits serverless function bodies to ~4.5 MB; we use
    // 3.8 MB as the safety threshold to leave room for FormData overhead).
    const PER_BATCH_MAX = 3.8 * 1024 * 1024
    files = await Promise.all(files.map(f => f.size > PER_BATCH_MAX ? reencodeWebtoonSmaller(f, PER_BATCH_MAX) : Promise.resolve(f)))
    const stillTooBig = files.find(f => f.size > PER_BATCH_MAX)
    if (stillTooBig) {
      await ask.alert(
        `"${stillTooBig.name}" is ${(stillTooBig.size / 1024 / 1024).toFixed(1)} MB after compression — Vercel caps each request at 4.5 MB. Split this strip into shorter sections (the reader joins them back end-to-end) and try again.`,
        'Strip too tall',
      )
      return
    }

    // Step 4 — pack into batches that each stay under the cap. Then upload
    // sequentially, shifting mode/index forward so each batch lands right
    // after the previous one in the strip order.
    const batches: File[][] = []
    let cur: File[] = []
    let curSize = 0
    for (const f of files) {
      if (cur.length > 0 && curSize + f.size > PER_BATCH_MAX) {
        batches.push(cur); cur = []; curSize = 0
      }
      cur.push(f); curSize += f.size
    }
    if (cur.length) batches.push(cur)

    let currentMode: 'replace' | 'before' | 'after' = job.mode
    let currentIndex = job.index
    let labelIdx = 0
    let uploadedCount = 0
    let failed = false

    for (const batch of batches) {
      const fd = new FormData()
      fd.append('cid', cid); fd.append('name', name)
      fd.append('mode', currentMode); fd.append('index', String(currentIndex))
      batch.forEach((f, i) => {
        const overall = labelIdx + i
        const lbl = currentMode === 'replace'
          ? (strips[currentIndex + overall]?.label || sec)
          : (files.length > 1 ? `${sec} ${overall + 1}` : sec)
        fd.append('label', lbl)
        fd.append('section', sec)
        fd.append('file', f)
      })
      try {
        const r = await fetch('/api/comics/upload', { method: 'POST', body: fd })
        if (!r.ok) throw new Error(await errFromResponse(r))
      } catch (err) {
        await ask.alert(
          `Upload failed after ${uploadedCount}/${files.length} strip(s): ${err instanceof Error ? err.message : String(err)}`,
          'Upload failed',
        )
        failed = true
        break
      }
      uploadedCount += batch.length
      labelIdx += batch.length
      // Shift the next batch to land right after the freshly-uploaded one.
      if (currentMode === 'before') {
        // splice(index, 0, ...batch) → new items occupy index..index+N-1.
        // Next batch should go AFTER the last new item.
        currentMode = 'after'
        currentIndex = currentIndex + batch.length - 1
      } else if (currentMode === 'after') {
        // splice(index+1, 0, ...batch) → new items at index+1..index+N.
        currentIndex = currentIndex + batch.length
      } else if (currentMode === 'replace') {
        // splice(index, N, ...batch) → replaced N items at index..index+N-1.
        // Continue inserting after the last replaced item.
        currentMode = 'after'
        currentIndex = currentIndex + batch.length - 1
      }
    }

    setGsel(new Set())
    await resolve()
    if (!failed) {
      flashToast(
        'ok',
        files.length === 1 ? 'Strip uploaded'
          : batches.length === 1 ? `${files.length} strips uploaded`
            : `${files.length} strips uploaded (in ${batches.length} batches)`,
      )
    }
  }

  const convertExisting = async (i: number) => {
    const s = strips[i]
    if (!s.img || !s.file) return
    try {
      const blob = await fetch(s.img).then(r => { if (!r.ok) throw new Error('download failed'); return r.blob() })
      const src = new File([blob], s.file, { type: blob.type || 'image/png' })
      const webp = await fileToWebpWebtoon(src)
      const fd = new FormData()
      fd.append('cid', cid); fd.append('name', name)
      fd.append('mode', 'replace'); fd.append('index', String(i))
      fd.append('label', s.label); fd.append('section', s.section || '')
      fd.append('file', webp)
      const r = await fetch('/api/comics/upload', { method: 'POST', body: fd })
      if (!r.ok) throw new Error(await errFromResponse(r))
      await resolve()
      flashToast('ok', 'Converted to WEBP')
    } catch (e) { await ask.alert('Convert failed: ' + (e instanceof Error ? e.message : String(e)), 'Convert failed') }
  }

  const rename = async (i: number) => {
    const cur = strips[i]
    const next = await ask.prompt(`Rename strip "${cur.label}":`, cur.label, 'Rename strip')
    if (next == null || next === cur.label) return
    const updated = strips.map((p, k) => k === i ? { ...p, label: next } : p)
    setStrips(updated)
    try { await patchStrips(updated); flashToast('ok', `Renamed to "${next}"`) }
    catch (e) { setStrips(strips); flashToast('err', 'Rename failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const setSection = async (i: number) => {
    const cur = strips[i]
    const next = await ask.prompt(
      `Episode / section for "${cur.label}" (e.g. E1, E2, Cover, Interview):`,
      cur.section || '',
      'Set episode / section',
    )
    if (next == null) return
    const sec = next.trim() || null
    if ((cur.section || null) === sec) return
    const updated = strips.map((p, k) => k === i ? { ...p, section: sec } : p)
    setStrips(updated)
    try { await patchStrips(updated); flashToast('ok', sec ? `Moved to ${sec}` : 'Section cleared') }
    catch (e) { setStrips(strips); flashToast('err', 'Set section failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // Rename an entire section run (right-click the nav button).
  const renameSection = async (sectionIdx: number) => {
    const sec = sections[sectionIdx]
    if (!sec) return
    const next = await ask.prompt(`Rename episode "${sec.name}" (applies to all ${sec.indices.length} strip(s)):`, sec.name, 'Rename episode')
    if (next == null) return
    const nm = next.trim()
    if (!nm || nm === sec.name) return
    const within = new Set(sec.indices)
    const updated = strips.map((p, k) => within.has(k) ? { ...p, section: nm } : p)
    setStrips(updated)
    try { await patchStrips(updated); flashToast('ok', `Episode renamed to "${nm}"`) }
    catch (e) { setStrips(strips); flashToast('err', 'Rename failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const setTier = async (i: number) => {
    const cur = strips[i]
    const opts = [
      { value: 'base', label: 'Base (shown to all tiers)' },
      ...tierNames.map(t => ({ value: t.toLowerCase(), label: `${t} and above` })),
    ]
    const choice = await ask.select(`Which tier should "${cur.label}" be visible to?`, opts, (cur.tier || 'base').toLowerCase(), 'Set strip tier')
    if (choice == null) return
    const tier = choice === 'base' ? null : choice
    if ((cur.tier || null) === tier) return
    const updated = strips.map((p, k) => k === i ? { ...p, tier } : p)
    setStrips(updated)
    try { await patchStrips(updated); flashToast('ok', tier ? `Tier set to ${tier}` : 'Set to base') }
    catch (e) { setStrips(strips); flashToast('err', 'Set tier failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const del = async (idxs: number[]) => {
    const listed = [...new Set(idxs)].sort((a, b) => a - b)
    if (!listed.length) return
    const ok = await ask.confirm(`Delete ${listed.length} strip(s)? This cannot be undone.`, { okText: 'Delete', danger: true, title: 'Confirm delete' })
    if (!ok) return
    const set = new Set(listed)
    const deleteFiles = listed.map(i => strips[i]?.file).filter(Boolean)
    const next = strips.filter((_, k) => !set.has(k))
    try {
      await patchStrips(next, { deleteFiles })
      setGsel(new Set())
      await resolve()
      flashToast('ok', `${listed.length} strip(s) deleted`)
    } catch (e) { await ask.alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)), 'Delete failed') }
  }

  const backfillArweave = async () => {
    const ok = await ask.confirm('Permanently mirror this webtoon’s strips to Arweave? Requires TURBO_ETH_KEY or ARWEAVE_JWK to be configured.', { okText: 'Mirror to Arweave', title: 'Arweave backup' })
    if (!ok) return
    try {
      const r = await fetch('/api/comics/arweave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, nameHint: name, variant: 'full' }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      const j = await r.json()
      flashToast('ok', `Arweave: ${j.uploaded} mirrored, ${j.skipped} skipped`)
    } catch (e) { await ask.alert('Arweave backup failed: ' + (e instanceof Error ? e.message : String(e)), 'Arweave failed') }
  }

  const switchToPages = async () => {
    const ok = await ask.confirm('Switch this comic to the paged book reader? Strips stay stored; only the reading layout changes.', { okText: 'Switch to pages', title: 'Change format' })
    if (!ok) return
    try {
      const r = await fetch('/api/comics', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, nameHint: name, format: 'pages' }),
      })
      if (!r.ok) throw new Error(await errFromResponse(r))
      onSwitchFormat?.('pages')
    } catch (e) { await ask.alert('Could not switch format: ' + (e instanceof Error ? e.message : String(e)), 'Failed') }
  }

  // ── Styles (same LW chrome as ComicReader) ──
  const btn: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', color: '#bab1a8', border: 'none', borderRadius: '4px', padding: '0.2rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer', minWidth: '24px', lineHeight: 1.4 }
  const sel: React.CSSProperties = { ...btn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }
  const floatBtn = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '10px', zIndex: 6,
    background: 'var(--lw-purple, #6a24fa)', color: '#fff', border: 'none', width: 37, height: 37,
    borderRadius: 8, cursor: 'pointer', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 4,
    boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: 0.9,
  })
  const msg: React.CSSProperties = { position: 'absolute', inset: 0, background: '#111111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '2rem' }
  const navBtn: React.CSSProperties = { ...btn, fontWeight: 700, padding: '.35rem .5rem', minWidth: 40, textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }
  const navActive: React.CSSProperties = { ...navBtn, background: 'var(--lw-purple, #6a24fa)', color: '#fff' }

  return createPortal(
    <div
      onMouseDown={e => { backdropDownRef.current = e.target === e.currentTarget }}
      onTouchStart={e => { backdropDownRef.current = e.target === e.currentTarget }}
      onClick={e => {
        const wasBackdropDown = backdropDownRef.current
        backdropDownRef.current = false
        if (e.target === e.currentTarget && wasBackdropDown) onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#111111', borderRadius: 12, width: 'min(1200px,96vw)', height: '95vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, zIndex: 8, background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>&#x2715;</button>

        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFile} />

        <div style={{ flex: 1, position: 'relative', background: '#111111' }}>
          {phase === 'resolving' && <div style={msg}><p style={{ color: '#bab1a8', fontSize: '.9rem', margin: 0 }}>Checking comic data&hellip;</p></div>}

          {phase === 'unavailable' && (
            <div style={msg}>
              <p style={{ color: '#e4dad1', fontSize: '1rem', margin: 0 }}>{reason}</p>
              <p style={{ color: '#7a7572', fontSize: '.78rem', margin: 0, wordBreak: 'break-all' }}>CID {cid}</p>
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                <button style={sel} onClick={resolve}>Retry</button>
                {admin && <button style={{ ...sel, fontWeight: 700 }} onClick={makeFallback}>MAKE WEBTOON</button>}
              </div>
              {admin && (
                <p style={{ color: '#7a7572', fontSize: '.72rem', margin: '.25rem 0 0', maxWidth: '32rem' }}>
                  Creates a starter webtoon (Cover + E1). Then open the Grid and right-click a slot to upload tall strip images.
                </p>
              )}
            </div>
          )}

          {/* ── Reader: continuous vertical scroll ── */}
          {phase === 'ready' && !gridOpen && (
            <>
              <div ref={scrollRef} onScroll={onScroll}
                style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', background: '#111111' }}>
                <div style={{ width: READING_WIDTH, maxWidth: '100%', margin: '0 auto' }}>
                  {strips.map((s, i) => (
                    <div key={i} ref={el => { stripEls.current[i] = el }}
                      onContextMenu={admin ? (e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, index: i }) }) : undefined}>
                      {s.img ? (
                        <img src={s.img} alt={s.label} loading="lazy" draggable={false}
                          style={{ width: '100%', display: 'block', userSelect: 'none' }} />
                      ) : (
                        <div style={{ width: '100%', height: 360, background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '.8rem' }}>
                          {s.label} — no image yet
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Right-side episode / section nav */}
              {sections.length > 0 && (
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '88%', overflowY: 'auto', padding: '.3rem', background: 'rgba(0,0,0,.45)', borderRadius: 8 }}>
                  {sections.map((secn, si) => (
                    <button key={si} style={si === activeSection ? navActive : navBtn}
                      title={admin ? `${secn.name} — right-click to rename episode` : secn.name}
                      onClick={() => jumpToSection(si)}
                      onContextMenu={admin ? (e => { e.preventDefault(); renameSection(si) }) : undefined}>
                      {secn.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Admin filmstrip: horizontal sequence of strips ── */}
          {phase === 'ready' && gridOpen && (
            <div style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'hidden', background: '#111111', padding: '.75rem' }}>
              {gsel.size > 0 && (
                <div style={{ position: 'sticky', left: 0, zIndex: 2, display: 'inline-flex', gap: '.5rem', alignItems: 'center', background: '#0b0b0b', padding: '.4rem .5rem', marginBottom: '.5rem', borderRadius: 6 }}>
                  <span style={{ color: '#bab1a8', fontSize: '.72rem' }}>{gsel.size} selected</span>
                  <button style={sel} title="Insert files before the first selected strip" onClick={() => startUpload('before', Math.min(...Array.from(gsel)))}>Insert files here&hellip;</button>
                  <button style={{ ...sel, background: '#b3324a' }} onClick={() => del([...gsel])}>Delete ({gsel.size})</button>
                  <button style={btn} onClick={() => setGsel(new Set())}>Clear</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', height: 'calc(100% - .5rem)' }}>
                {strips.map((s, i) => {
                  const newSection = i === 0 || strips[i - 1]?.section !== s.section
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', height: '100%' }}>
                      {newSection && i > 0 && <div style={{ width: 2, alignSelf: 'stretch', background: 'rgba(106,36,250,.5)', borderRadius: 2 }} />}
                      <div
                        onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) setGsel(g => { const n = new Set(g); n.has(i) ? n.delete(i) : n.add(i); return n }); else setCtx({ x: e.clientX, y: e.clientY, index: i }) }}
                        onContextMenu={e => { e.preventDefault(); setPreview(i) }}
                        style={{ position: 'relative', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', background: '#1a1a1c', outline: gsel.has(i) ? '2px solid var(--lw-purple,#6a24fa)' : '2px solid transparent' }}>
                        <div style={{ flex: 1, minHeight: 0, background: '#0d0d0d', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' }}>
                          {s.img
                            ? <img src={s.img} alt={s.label} style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
                            : <span style={{ color: '#555', fontSize: '.7rem', alignSelf: 'center', padding: '0 1rem' }}>no image</span>}
                        </div>
                        {s.tier && (
                          <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(106,36,250,.92)', color: '#fff', fontSize: '.58rem', fontWeight: 700, padding: '.12rem .35rem', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.tier}</div>
                        )}
                        <div style={{ padding: '.3rem .4rem', maxWidth: 180 }}>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: '.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                          <div style={{ color: '#8d7df0', fontSize: '.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.section || '(no section)'}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', padding: '.4rem .6rem', background: '#0b0b0b', borderTop: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <span style={{ color: '#7a7572', fontSize: '.62rem', whiteSpace: 'nowrap', marginRight: '.2rem', flexShrink: 0 }}>
            {phase === 'ready'
              ? `Webtoon · ${strips.length} strip${strips.length === 1 ? '' : 's'} · ${sections.length} section${sections.length === 1 ? '' : 's'}`
              : 'Webtoon'}
          </span>
          {admin && phase === 'ready' && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '.25rem' }}>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Toggle admin filmstrip" onClick={() => { setGridOpen(g => !g); setGsel(new Set()) }}>{gridOpen ? 'Reader' : 'Grid'}</button>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Add strip(s) at the end" onClick={() => startUpload('after', strips.length - 1)} disabled={strips.length === 0}>+ Strip</button>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Mirror all strips to Arweave (permanent double-fallback)" onClick={backfillArweave}>Arweave</button>
              <button style={{ ...btn, background: 'rgba(106,36,250,.25)', color: '#fff' }}
                title="Switch this comic to the paged book reader" onClick={switchToPages}>Paged mode</button>
            </span>
          )}
        </div>
      </div>

      {ctx && admin && strips[ctx.index] && (
        <StripContextMenu
          ctx={ctx}
          label={strips[ctx.index]?.label ?? ''}
          tier={strips[ctx.index]?.tier ?? null}
          section={strips[ctx.index]?.section ?? null}
          hasNonWebp={notWebp(strips[ctx.index]?.file)}
          onClose={() => setCtx(null)}
          onReplace={() => startUpload('replace', ctx.index)}
          onInsertBefore={() => startUpload('before', ctx.index)}
          onInsertAfter={() => startUpload('after', ctx.index)}
          onRename={() => rename(ctx.index)}
          onSetTier={() => setTier(ctx.index)}
          onSetSection={() => setSection(ctx.index)}
          onConvert={() => convertExisting(ctx.index)}
          onDelete={() => del([ctx.index])}
        />
      )}

      {/* Full-strip preview: purple glow, click anywhere to close, ‹ › cycle. */}
      {preview !== null && strips[preview] && (
        <div onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem', overflow: 'auto' }}>
          {strips[preview].img ? (
            <img src={strips[preview].img!} alt={strips[preview].label} draggable={false}
              style={{
                maxWidth: '92%', objectFit: 'contain', borderRadius: 4,
                boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)',
                userSelect: 'none',
              }} />
          ) : (
            <div style={{ color: '#7a7572', fontSize: '1rem', padding: '2rem', textAlign: 'center' }}>
              &ldquo;{strips[preview].label}&rdquo; — no image yet
            </div>
          )}
          <button title="Previous (wraps)"
            onClick={e => { e.stopPropagation(); setPreview((preview - 1 + strips.length) % strips.length) }}
            style={floatBtn('left')}>&#8249;</button>
          <button title="Next (wraps)"
            onClick={e => { e.stopPropagation(); setPreview((preview + 1) % strips.length) }}
            style={floatBtn('right')}>&#8250;</button>
          <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', color: '#bab1a8', fontSize: '.8rem', background: 'rgba(0,0,0,.6)', padding: '.3rem .8rem', borderRadius: 6 }}>
            {strips[preview].label} · {strips[preview].section || 'no section'} · {preview + 1}/{strips.length}
          </div>
        </div>
      )}

      {/* In-app modal */}
      {modal && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <form
            onSubmit={e => { e.preventDefault(); const m = modal; setModal(null); m.resolve(m.kind === 'prompt' ? modalInput : true) }}
            style={{ background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)', borderRadius: 12, padding: '1.25rem', minWidth: 'min(440px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }}>
            {modal.title && <h3 style={{ color: '#fff', margin: '0 0 .6rem', fontSize: '1rem', fontWeight: 700 }}>{modal.title}</h3>}
            <p style={{ color: '#e4dad1', margin: '0 0 1rem', fontSize: '.9rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{modal.message}</p>
            {modal.kind === 'prompt' && (modal.options
              ? <select autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)}
                  style={{ width: '100%', background: '#0b0b0b', border: '1px solid rgba(255,255,255,.15)', color: '#fff', padding: '.55rem .7rem', borderRadius: 6, fontSize: '.95rem', marginBottom: '1rem', boxSizing: 'border-box' }}>
                  {modal.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              : <input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)}
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

      {/* Toast */}
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
