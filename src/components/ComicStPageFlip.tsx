'use client'

/**
 * StPageFlipEffect — realistic page-curl turn, powered by the MIT-licensed
 * `page-flip` library (StPageFlip). Registered as the 'stpageflip' effect
 * in ComicPageTurn and used as the reader's default.
 *
 * page-flip owns its own pages, drag, click-to-flip, animation and
 * shadows, so this builds the page DOM imperatively — React never
 * reconciles against the DOM page-flip mutates — and two-way binds the
 * current leaf with the reader: currentLeaf prop → pageFlip.flip();
 * a user flip → onLeafChange().
 *
 * Density: page-flip models a page as either fully soft (curls) or fully
 * rigid ("hard", like a hardback cover) — there is no in-between. Comic
 * covers use heavier stock than inner pages but still bend, and page-flip
 * can't represent that middle ground, so every page including the covers
 * is left soft.
 */

import { useEffect, useRef, useState } from 'react'
import { PageFlip } from 'page-flip'
import type { PageTurnProps } from './ComicPageTurn'

const FLIP_MS = 700

// Leaf ↔ page-index mapping. In LANDSCAPE we prepend a black blank
// before the cover (and append one after the back cover when needed for
// even parity) so every page-flip spread is a normal 2-up — that
// avoids page-flip's PageCollection forcing density=HARD on the
// lone-cover (showCover) and on any trailing single page. With the
// padding, the user's cover ends up as the right page of spread 0
// against a black left "page" — looks like a closed book — and bends
// like any soft page when turned, revealing pages 1+2 behind it.
// In PORTRAIT page-flip shows one page per spread so no padding is
// needed and the mapping is identity.
const leafToPage = (leaf: number, portrait: boolean) =>
  portrait ? Math.max(0, leaf) : Math.max(0, leaf) * 2
const pageToLeaf = (page: number, portrait: boolean) =>
  portrait ? Math.max(0, page) : Math.max(0, Math.floor(page / 2))

// page-flip ships no CSS in its dist build — these structural rules are
// required for it to lay out and are inlined so there's no import to
// resolve. Plus the comic page / placeholder styling.
const STF_CSS = `
.stf__parent{position:relative;display:block;box-sizing:border-box;transform:translateZ(0);touch-action:pan-y}
.sft__wrapper{position:relative;width:100%;box-sizing:border-box}
.stf__parent canvas{position:absolute;width:100%;height:100%;left:0;top:0}
.stf__block{position:absolute;width:100%;height:100%;box-sizing:border-box;perspective:2000px}
.stf__item{display:none;position:absolute;transform-style:preserve-3d}
.stf__outerShadow,.stf__innerShadow,.stf__hardShadow,.stf__hardInnerShadow{position:absolute;left:0;top:0}
.spf-page{background:#111;overflow:hidden}
.spf-page>img{width:100%;height:100%;object-fit:contain;background:#111;pointer-events:none;display:block}
.spf-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;background:#161616;color:#7a7572;font-size:.85rem;text-align:center;padding:1rem;box-sizing:border-box}
`

export function StPageFlipEffect(p: PageTurnProps) {
  const pages = p.allPages || []
  // We render only a host div via React. page-flip's container is created
  // imperatively inside it — that way React never reconciles against the
  // DOM page-flip mutates, and we can give the container real pixel
  // dimensions without React fighting with page-flip's runtime styles.
  const hostRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<PageFlip | null>(null)
  const internalLeaf = useRef<number>(p.currentLeaf ?? 0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Holding refs to Image() preloaders keeps the browser from cancelling
  // their fetches — by the time the cover flips, pages 1-2 are already
  // in the HTTP cache and load instantly into the visible page elements.
  const preloadsRef = useRef<HTMLImageElement[]>([])
  const propsRef = useRef(p)
  propsRef.current = p
  const [resizeTick, setResizeTick] = useState(0)

  // Stable content signature — rebuild page-flip only when the page set
  // actually changes, not on every parent re-render.
  const sig = pages.map(pg => pg.img || ('∅' + pg.label)).join('|')

  useEffect(() => {
    audioRef.current = typeof Audio !== 'undefined' ? new Audio('/page-flip.mp3') : null
    if (audioRef.current) audioRef.current.volume = 0.5
  }, [])

  // Debounced resize → rebuild (page-flip's size bounds are fixed at init).
  useEffect(() => {
    let t: number | undefined
    const onResize = () => { window.clearTimeout(t); t = window.setTimeout(() => setResizeTick(n => n + 1), 220) }
    window.addEventListener('resize', onResize)
    return () => { window.clearTimeout(t); window.removeEventListener('resize', onResize) }
  }, [])

  // Build / rebuild page-flip — gated on the first few page images
  // actually loading, otherwise the cover flips to reveal not-yet-fetched
  // pages and the user sees black-then-fade-in instead of the real spread.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !pages.length) return
    let cancelled = false
    const portrait = !!p.narrow

    // Kick off network fetches for EVERY page image immediately. Holding
    // refs keeps the browser from cancelling in-flight requests; the
    // resulting cache means the actual <img> in page-flip's pages loads
    // instantly once it becomes visible.
    preloadsRef.current = []
    for (const pg of pages) {
      if (!pg.img) continue
      try { const pre = new Image(); pre.src = pg.img; preloadsRef.current.push(pre) } catch { /* */ }
    }

    // Show a temporary "Loading…" while the cover + first spread reach
    // the cache. Without this, the cover starts flipping before pages
    // 1+2 have arrived and the reveal is just black.
    host.innerHTML = ''
    const loading = document.createElement('div')
    loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#bab1a8;font-size:.9rem;background:#111'
    loading.textContent = 'Loading comic…'
    host.appendChild(loading)

    // Wait until the cover and the pages that will be revealed behind it
    // are loaded. Cap the wait so a broken or slow image can't hang the
    // reader — after 3s we mount anyway.
    const priorityUrls = pages.slice(0, 3).map(pg => pg.img).filter((u): u is string => !!u)
    const awaitImage = (u: string) => new Promise<void>(res => {
      const i = new Image()
      i.onload = i.onerror = () => res()
      i.src = u
    })
    const ready: Promise<unknown> = priorityUrls.length
      ? Promise.race([
          Promise.all(priorityUrls.map(awaitImage)),
          new Promise(res => window.setTimeout(res, 3000)),
        ])
      : Promise.resolve()

    let container: HTMLDivElement | null = null
    let pf: PageFlip | null = null
    let startLeaf = propsRef.current.currentLeaf ?? 0

    ready.then(() => {
      if (cancelled || !hostRef.current) return
      const liveHost = hostRef.current
      if (loading.parentNode === liveHost) liveHost.removeChild(loading)

      // Create the page-flip container imperatively as a child of the host.
      // width/height 100% of the host (which is position:absolute; inset:0)
      // gives page-flip real pixel dimensions to stretch into.
      container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%;box-sizing:border-box'
      liveHost.appendChild(container)

      // Landscape padding (see leafToPage comment): leading blank always,
      // trailing blank only when needed to keep the total page count even
      // so page-flip never builds a trailing-alone spread (which it forces
      // to HARD density). In portrait, no padding — pages render one at a
      // time and density doesn't matter.
      const wantLeading = !portrait
      const wantTrailing = !portrait && ((pages.length + 1) % 2 === 1)
      const makeBlank = () => {
        const el = document.createElement('div')
        el.className = 'spf-page'
        el.dataset.density = 'soft'
        el.style.cssText = 'background:#0b0b0b'
        return el
      }
      if (wantLeading) container.appendChild(makeBlank())

      for (const pg of pages) {
        const el = document.createElement('div')
        el.className = 'spf-page'
        el.dataset.density = 'soft'   // see file header — covers stay soft
        if (pg.img) {
          const img = document.createElement('img')
          img.src = pg.img
          img.alt = pg.label
          img.draggable = false
          let triedAr = false
          img.addEventListener('error', () => {
            if (pg.ar && !triedAr) { triedAr = true; img.src = pg.ar }
            else propsRef.current.onImageFailed()
          })
          el.appendChild(img)
        } else {
          const ph = document.createElement('div')
          ph.className = 'spf-ph'
          const a = document.createElement('span'); a.style.color = '#bab1a8'; a.textContent = `“${pg.label}”`
          const b = document.createElement('span'); b.textContent = 'No image yet' + (propsRef.current.admin ? ' — use Grid to upload' : '')
          ph.appendChild(a); ph.appendChild(b)
          el.appendChild(ph)
        }
        container.appendChild(el)
      }
      if (wantTrailing) container.appendChild(makeBlank())

      const cw = Math.max(360, liveHost.clientWidth - 16)
      const ch = Math.max(360, liveHost.clientHeight - 16)
      startLeaf = propsRef.current.currentLeaf ?? 0

      try {
        pf = new PageFlip(container, {
          width: 480, height: 680,        // single-page aspect basis
          size: 'stretch',
          minWidth: 180, maxWidth: cw,
          minHeight: 260, maxHeight: ch,
          drawShadow: true,
          flippingTime: FLIP_MS,
          usePortrait: portrait,
          // showCover:false on purpose — page-flip's showCover branch
          // force-sets HARD density on the cover (and any trailing-alone
          // page), ignoring our soft data-density. We pad with a blank
          // page instead (see leafToPage) so the cover is just the right
          // page of an ordinary 2-up spread that bends like any other.
          showCover: false,
          autoSize: true,
          maxShadowOpacity: 0.5,
          mobileScrollSupport: false,
          startPage: leafToPage(startLeaf, portrait),
          swipeDistance: 30,
          showPageCorners: true,
          disableFlipByClick: false,
          useMouseEvents: true,
          clickEventForward: true,
        })
        pf.loadFromHTML(container.querySelectorAll<HTMLElement>('.spf-page'))
      } catch {
        return
      }
      if (!pf) return
      flipRef.current = pf
      internalLeaf.current = startLeaf

      const localPf = pf
      localPf.on('flip', e => {
        const isPortrait = localPf.getOrientation() === 'portrait'
        const leaf = pageToLeaf(Number(e.data), isPortrait)
        internalLeaf.current = leaf
        propsRef.current.onLeafChange?.(leaf)
      })
      localPf.on('changeState', e => {
        // 'flipping' = the committed turn animation has started.
        if (e.data === 'flipping') {
          const a = audioRef.current
          if (a) { try { a.currentTime = 0; a.play().catch(() => {}) } catch { /* */ } }
        }
      })
    })

    return () => {
      cancelled = true
      try { pf?.destroy() } catch { /* */ }
      flipRef.current = null
      preloadsRef.current = []
      if (loading.parentNode === host) host.removeChild(loading)
      if (container && container.parentNode === host) host.removeChild(container)
    }
  }, [sig, p.narrow, resizeTick])

  // External navigation (nav buttons / page bar) → flip page-flip to match.
  // The converge check (currentLeaf === internalLeaf) breaks the feedback
  // loop: a user flip reports back via onLeafChange, which updates
  // currentLeaf, which then matches and no-ops here.
  useEffect(() => {
    const pf = flipRef.current
    if (!pf || p.currentLeaf == null) return
    if (p.currentLeaf === internalLeaf.current) return
    internalLeaf.current = p.currentLeaf
    const isPortrait = pf.getOrientation() === 'portrait'
    try { pf.flip(leafToPage(p.currentLeaf, isPortrait)) } catch { /* */ }
  }, [p.currentLeaf])

  return (
    <>
      <style>{STF_CSS}</style>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#111111', padding: 8, boxSizing: 'border-box' }} />
    </>
  )
}
