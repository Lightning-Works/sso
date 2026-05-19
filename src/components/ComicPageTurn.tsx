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
}

// One place to tune duration across all effects.
const DURATION_MS = 500

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
 * BookFlipEffect — placeholder for the CodePen book-flip the user wants
 * (https://codepen.io/Maseone/pen/WbbGxeO). CodePen blocks automated
 * scraping, so until the user pastes the source here, this effect
 * delegates to SlideEffect so the reader still works.
 *
 * When the source arrives, replace the body with the keyframes / DOM /
 * any helper logic that effect needs. Keep the spreadKey trigger and
 * the <Pages /> render so the rest of the reader keeps working.
 */
function BookFlipEffect(p: PageTurnProps) {
  return <SlideEffect {...p} />
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
