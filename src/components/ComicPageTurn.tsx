'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * ComicPageTurn — the page-turning visual, isolated so we can swap
 * implementations without touching the reader.
 *
 * Add a new effect:
 *   1. Write a `function MyEffect(p: PageTurnProps) { ... }`
 *   2. Register it in EFFECTS below
 *   3. Pass `effect="myeffect"` from ComicReader.
 *
 * Each effect receives the current spread + a `spreadKey` that changes
 * on every page turn, plus the `direction` of that turn ('next' | 'prev').
 * Effects handle their own timing/animation via CSS keyframes keyed on
 * `spreadKey` so they don't need state-resetting from the parent.
 */

export type PageDisplay = { label: string; img: string; ar: string }
export type TurnDirection = 'next' | 'prev' | 'none'
export type TurnEffect = 'slide' | 'crossfade' | 'bookflip' | 'none'

export interface PageTurnProps {
  display: PageDisplay[]
  name: string
  spreadKey: number          // changes per spread — drives re-animation
  direction: TurnDirection   // most-recent turn direction
  onImageFailed: () => void
  admin?: boolean
  effect?: TurnEffect
  // BookFlipEffect-only (other effects ignore these):
  allPages?: PageDisplay[]   // every page in order (not just current spread)
  currentLeaf?: number       // = sIdx when book-flip leaf spreads are used
  narrow?: boolean
  onPageAdvance?: (dir: 'next' | 'prev') => void
}

// One place to tune duration across all effects.
const DURATION_MS = 500
// Book-flip uses its own duration (original CodePen was 1.4s; user wants 2x faster).
const FLIP_MS = 700

/**
 * Spread layout for the book-flip effect — pairs pages sequentially as
 * "leaves" (cover alone on right, then 2-up middle, optional solo end).
 * Use INSTEAD of the reader's normal buildSpreads when effect='bookflip'.
 */
export function buildLeafSpreads(pageCount: number, narrow: boolean): number[][] {
  if (narrow) return Array.from({ length: pageCount }, (_, i) => [i])
  if (pageCount <= 0) return []
  const out: number[][] = [[0]]  // closed book — cover alone on right
  for (let i = 1; i + 1 < pageCount; i += 2) out.push([i, i + 1])
  if (pageCount > 1 && pageCount % 2 === 0) out.push([pageCount - 1])  // trailing solo
  return out
}

/** The bare images/placeholders — every effect wraps this. */
function Pages(p: PageTurnProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: p.display.length > 1 ? '4px' : 0 }}>
      {p.display.map((d, i) => d.img ? (
        <img key={i} src={d.img} alt={`${p.name} — ${d.label}`}
          onError={e => {
            const im = e.currentTarget
            if (d.ar && im.getAttribute('data-ar') !== '1') { im.setAttribute('data-ar', '1'); im.src = d.ar }
            else p.onImageFailed()
          }}
          style={{ flex: 1, minWidth: 0, height: '100%', objectFit: 'contain', background: '#111111' }} />
      ) : (
        <div key={i} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '.4rem', background: '#161616', color: '#7a7572',
          fontSize: '.85rem', textAlign: 'center', padding: '1rem' }}>
          <span style={{ color: '#bab1a8' }}>&ldquo;{d.label}&rdquo;</span>
          <span>No image yet{p.admin ? ' — right-click this page button below to upload' : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ── Effects ──────────────────────────────────────────────────────────────

function NoneEffect(p: PageTurnProps) {
  return <div style={{ position: 'absolute', inset: 0, background: '#111111' }}><Pages {...p} /></div>
}

/** Soft directional slide + fade. Clean, no shadows. The new default. */
function SlideEffect(p: PageTurnProps) {
  const cls = p.direction === 'next' ? 'pt-slide-next' : p.direction === 'prev' ? 'pt-slide-prev' : ''
  return (
    <>
      <style>{`
        @keyframes pt-slide-in-next{0%{opacity:0;transform:translateX(6%)}100%{opacity:1;transform:none}}
        @keyframes pt-slide-in-prev{0%{opacity:0;transform:translateX(-6%)}100%{opacity:1;transform:none}}
        .pt-slide-next{animation:pt-slide-in-next ${DURATION_MS}ms cubic-bezier(.2,.7,.2,1)}
        .pt-slide-prev{animation:pt-slide-in-prev ${DURATION_MS}ms cubic-bezier(.2,.7,.2,1)}
      `}</style>
      <div key={p.spreadKey} className={cls} style={{ position: 'absolute', inset: 0, background: '#111111' }}>
        <Pages {...p} />
      </div>
    </>
  )
}

/** Symmetric crossfade — even simpler. */
function CrossFadeEffect(p: PageTurnProps) {
  return (
    <>
      <style>{`@keyframes pt-fade{from{opacity:0}to{opacity:1}}`}</style>
      <div key={p.spreadKey} style={{ position: 'absolute', inset: 0, background: '#111111', animation: `pt-fade ${DURATION_MS}ms ease-out` }}>
        <Pages {...p} />
      </div>
    </>
  )
}

/**
 * BookFlipEffect — pure-CSS perspective book based on Jason Hibbs'
 * CodePen "Page Flip" (https://codepen.io/jasonhibbs/pen/MPbwwj),
 * ported to React + TypeScript. The jQuery click-flip is replaced by
 * React state driven from currentLeaf; sequential pairing (cover alone,
 * then leaves of 2 pages) comes from buildLeafSpreads.
 *
 * Falls back to SlideEffect when:
 *   - narrow mode (mobile) — book requires two-page width
 *   - allPages / currentLeaf not provided
 */
function BookFlipEffect(p: PageTurnProps) {
  if (!p.allPages || p.currentLeaf == null || p.narrow) return <SlideEffect {...p} />
  const totalLeaves = Math.ceil(p.allPages.length / 2)
  const cur = Math.max(0, Math.min(p.currentLeaf, totalLeaves))

  return (
    <>
      <style>{`
        .bf-perspective{position:absolute;inset:0;perspective:250vw;display:flex;align-items:center;justify-content:center;background:#111;padding:1rem}
        .bf-pages{position:relative;width:min(100%,calc((100% - 2rem)));height:100%;max-width:none;transform:rotateX(8deg);transform-style:preserve-3d;box-shadow:0 0 0 1px rgba(255,255,255,.04)}
        .bf-page{position:absolute;top:0;width:50%;height:100%;background:#111;transform-origin:0 0;transition:transform ${FLIP_MS}ms cubic-bezier(.4,.05,.3,1);backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:preserve-3d;cursor:pointer;user-select:none;overflow:hidden}
        .bf-page>img{width:100%;height:100%;object-fit:contain;background:#111;pointer-events:none}
        .bf-page>div.bf-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;background:#161616;color:#7a7572;font-size:.85rem;text-align:center;padding:1rem}
        .bf-page::before{content:'';position:absolute;inset:0;background:rgba(0,0,0,0);transition:background ${FLIP_MS / 2}ms;z-index:2;pointer-events:none}
        .bf-recto{right:0;border-radius:0 4px 4px 0;transform:rotateY(0deg);pointer-events:auto}
        .bf-verso{left:0;transform-origin:100% 0;border-radius:4px 0 0 4px;transform:rotateY(180deg);pointer-events:none}
        .bf-verso::before{background:rgba(0,0,0,.2)}
        .bf-flipped.bf-recto{transform:rotateY(-180deg);pointer-events:none}
        .bf-flipped.bf-recto::before{background:rgba(0,0,0,.2)}
        .bf-flipped.bf-verso{transform:rotateY(0deg);pointer-events:auto}
        .bf-flipped.bf-verso::before{background:rgba(0,0,0,0)}
        /* No :hover transforms — they create a feedback loop at page edges:
           tilt moves the page out from under the cursor → hover removed →
           page returns → cursor over it again → re-tilts, flicker at ~20Hz.
           cursor:pointer is enough affordance that the page is clickable. */
      `}</style>
      <div className="bf-perspective">
        <div className="bf-pages">
          {p.allPages.map((pg, i) => {
            const isRecto = (i % 2) === 0  // DOM 1st, 3rd, 5th… → right-hand page
            const flipped = i < (cur * 2)
            const cls = `bf-page ${isRecto ? 'bf-recto' : 'bf-verso'}${flipped ? ' bf-flipped' : ''}`
            // Stacking: only recto pages get explicit z-index, descending so
            // earlier leaves render on top of later ones until flipped.
            const z = isRecto ? (p.allPages!.length - i) : 1
            const click = () => {
              if (isRecto && !flipped) p.onPageAdvance?.('next')
              else if (!isRecto && flipped) p.onPageAdvance?.('prev')
            }
            return (
              <div key={i} className={cls} style={{ zIndex: z }} onClick={click}>
                {pg.img ? (
                  <img src={pg.img} alt={`${p.name} — ${pg.label}`}
                    onError={e => {
                      const im = e.currentTarget
                      if (pg.ar && im.getAttribute('data-ar') !== '1') { im.setAttribute('data-ar', '1'); im.src = pg.ar }
                      else p.onImageFailed()
                    }} />
                ) : (
                  <div className="bf-ph">
                    <span style={{ color: '#bab1a8' }}>&ldquo;{pg.label}&rdquo;</span>
                    <span>No image yet{p.admin ? ' — right-click this page button below to upload' : ''}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

const EFFECTS: Record<TurnEffect, React.FC<PageTurnProps>> = {
  slide: SlideEffect,
  crossfade: CrossFadeEffect,
  bookflip: BookFlipEffect,
  none: NoneEffect,
}

export function ComicPageTurn(props: PageTurnProps) {
  const Effect = EFFECTS[props.effect ?? 'slide']
  return <Effect {...props} />
}
