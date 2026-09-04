'use client'

/**
 * Assistant — chat with an AWW character (Skylie by default; switch via the
 * character circles). Chat is native over the Kinet.ink public-chat API (the SSO
 * embed is a different backend that rejects this key). Renders circle avatars,
 * tailed speech bubbles in the character's own colours, and the character's
 * full-body transparent image overlapping the panel's right edge.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHead } from '../ui/primitives'
import { CHARACTERS, askCharacter, fetchCharacterStyle, type CharDef, type CharStyle } from '../lib/aw/skylie'
import type { FeatureProps } from './ctx'

type Msg = { role: 'me' | 'char'; text: string }
const KF_ID = 'assistant-layout'

export default function Assistant({ account }: FeatureProps) {
  const [activeId, setActiveId] = useState('skylie')
  const active = useMemo(() => CHARACTERS.find(c => c.id === activeId) || CHARACTERS[0], [activeId])
  const [style, setStyle] = useState<CharStyle>(active.style)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(KF_ID)) return
    const st = document.createElement('style'); st.id = KF_ID
    st.textContent = `
      .as-row{display:flex;align-items:stretch}
      .as-panel{flex:1;min-width:0;display:flex;flex-direction:column;border:1px solid var(--aww-border,rgba(255,255,255,.12));border-radius:14px;overflow:hidden;background:#14141c;min-height:560px;box-shadow:0 0 40px color-mix(in srgb,var(--aww-primary,#8b5cf6) 20%,transparent)}
      .as-side{display:none;align-self:flex-end;margin-left:-70px;z-index:5;pointer-events:none;flex-shrink:0}
      .as-side img{height:min(56vh,496px);object-fit:contain;display:block;transform:translateX(75px);filter:drop-shadow(0 8px 26px rgba(0,0,0,.55))}
      @media(min-width:1024px){.as-side{display:block}}
    `
    document.head.appendChild(st)
  }, [])

  // Reset conversation + style when switching character. Pull the character's REAL
  // bubble colours/font/avatar from the API on mount (a free __init__ handshake),
  // so the bubbles are right before the first reply — not the placeholder colours.
  useEffect(() => {
    let cancelled = false
    setStyle(active.style)
    setMsgs([{ role: 'char', text: active.ready ? `Hi, I’m ${active.name} — your guide to Alien Worlds. Ask me anything about mining, tools, shining, shards, syndicates, the bridge, or your wallet.` : `${active.name} isn’t connected yet — the chat key is on the way. Chat with Skylie in the meantime.` }])
    if (active.ready) fetchCharacterStyle(active.apiKey).then(live => { if (!cancelled && live && Object.keys(live).length) setStyle(s => ({ ...s, ...live })) })
    return () => { cancelled = true }
  }, [active])

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy || !active.ready) return
    setInput(''); setMsgs(m => [...m, { role: 'me', text }]); setBusy(true)
    try {
      const { reply, style: st } = await askCharacter(active.apiKey, text)
      if (st && Object.keys(st).length) setStyle(s => ({ ...s, ...st }))
      setMsgs(m => [...m, { role: 'char', text: reply }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'char', text: e instanceof Error ? e.message : 'Something went wrong.' }])
    } finally { setBusy(false) }
  }

  const userInitial = (account || 'U').replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || 'U'
  const border = style.bubbleBorderColor || '#6B46C1'
  const bg = style.bubbleBackgroundColor || '#553C9A'
  const inner = style.bubbleInnerLineColor || '#9F7AEA'
  const textColor = style.bubbleTextColor || '#fff'

  return (
    <>
      <PageHead title="Assistant" />

      {/* Chat With: character switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 14px' }}>
        <span style={{ fontSize: 13, color: 'var(--aww-text-muted, #9aa)', fontWeight: 700 }}>Chat With:</span>
        {CHARACTERS.map(c => {
          const on = c.id === activeId
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)} title={c.ready ? c.name : `${c.name} (coming soon)`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', display: 'block',
                border: on ? '3px solid var(--aww-primary, #b06cff)' : '2px solid color-mix(in srgb, var(--aww-text-muted) 35%, transparent)',
                boxShadow: on ? '0 0 12px color-mix(in srgb, var(--aww-primary, #b06cff) 70%, transparent)' : 'none',
                opacity: c.ready ? 1 : 0.5 }}>
                <img src={c.sideImg} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              </span>
              <span style={{ fontSize: 11, color: on ? 'var(--aww-text)' : 'var(--aww-text-muted, #9aa)', fontWeight: on ? 700 : 500 }}>{c.name}</span>
            </button>
          )
        })}
      </div>

      <div className="as-row">
        <section className="as-panel">
          <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '58vh' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: m.role === 'me' ? 'row-reverse' : 'row' }}>
                {m.role === 'char'
                  ? <CharAvatar style={style} />
                  : <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'color-mix(in srgb, var(--aww-primary,#8b5cf6) 45%, #222)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, border: '2px solid color-mix(in srgb, var(--aww-primary,#8b5cf6) 70%, #000)' }}>{userInitial}</span>}
                <Bubble side={m.role === 'me' ? 'right' : 'left'} text={m.text}
                  bg={m.role === 'me' ? 'color-mix(in srgb, var(--aww-primary,#8b5cf6) 30%, #14141c)' : bg}
                  border={m.role === 'me' ? 'color-mix(in srgb, var(--aww-primary,#8b5cf6) 55%, transparent)' : border}
                  inner={m.role === 'me' ? 'transparent' : inner}
                  color={m.role === 'me' ? 'var(--aww-text)' : textColor}
                  font={style.bubbleFontFamily}
                  size={m.role === 'me' ? undefined : style.bubbleFontSize} />
              </div>
            ))}
            {busy && <div style={{ marginLeft: 42, fontSize: 13, fontStyle: 'italic', color: 'var(--aww-text-muted,#9aa)' }}>{active.name} is thinking…</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--aww-border, rgba(255,255,255,.1))' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder={active.ready ? `Ask ${active.name} anything…` : `${active.name} is not connected yet`}
              disabled={!active.ready}
              style={{ flex: 1, padding: '11px 13px', borderRadius: 10, fontSize: 14, background: 'color-mix(in srgb, var(--aww-text-muted) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)', color: 'var(--aww-text)' }} />
            <button onClick={send} disabled={busy || !input.trim() || !active.ready}
              style={{ padding: '0 18px', borderRadius: 10, border: 'none', fontWeight: 800, color: '#fff', cursor: busy || !input.trim() || !active.ready ? 'default' : 'pointer',
                background: busy || !input.trim() || !active.ready ? 'color-mix(in srgb, var(--aww-text-muted) 30%, transparent)' : 'linear-gradient(135deg, var(--aww-primary, #8b5cf6), color-mix(in srgb, var(--aww-primary, #8b5cf6) 60%, #4be1c2))' }}>
              Send
            </button>
          </div>
        </section>

        <div className="as-side"><img src={active.sideImg} alt={active.name} /></div>
      </div>
    </>
  )
}

function CharAvatar({ style }: { style: CharStyle }) {
  return (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0, backgroundColor: '#222',
      backgroundImage: style.avatarUrl ? `url(${style.avatarUrl})` : undefined,
      backgroundSize: `${(style.imageZoom || 1) * 100}%`,
      backgroundPosition: `${(style.imagePanX ?? 0.5) * 100}% ${(style.imagePanY ?? 0.5) * 100}%`,
      backgroundRepeat: 'no-repeat',
      border: `2px solid ${style.bubbleBorderColor || '#6B46C1'}`,
    }} />
  )
}

function Bubble({ side, text, bg, border, inner, color, font, size }: { side: 'left' | 'right'; text: string; bg: string; border: string; inner: string; color: string; font?: string; size?: number }) {
  const tail: React.CSSProperties = side === 'left'
    ? { left: -7, borderRight: `8px solid ${border}` }
    : { right: -7, borderLeft: `8px solid ${border}` }
  return (
    <div style={{
      position: 'relative', maxWidth: '76%', background: bg, color, border: `2px solid ${border}`,
      boxShadow: inner !== 'transparent' ? `inset 0 0 0 1px ${inner}` : 'none',
      borderRadius: 14, padding: '9px 13px', fontSize: size || 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
      fontFamily: font || 'inherit',
    }}>
      {text}
      <span style={{ position: 'absolute', bottom: 9, width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', ...tail }} />
    </div>
  )
}
