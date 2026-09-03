'use client'

/**
 * Assistant — Skylie, the AWW guide (Kinet.ink character-as-a-service). A chat
 * panel with Skylie's portrait set on the right, overlapping the panel's right
 * edge. Her reply bubbles use her own character styling from the service.
 */
import { useEffect, useRef, useState } from 'react'
import { PageHead } from '../ui/primitives'
import { askSkylie, SKYLIE_AVATAR, type SkylieStyle } from '../lib/aw/skylie'

type Msg = { role: 'me' | 'skylie'; text: string }
const KF_ID = 'skylie-kf'

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'skylie', text: 'Hi, I’m Skylie — your guide to Alien Worlds. Ask me about mining, tools, shining, shards, syndicates, the bridge, or anything in your wallet.' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [style, setStyle] = useState<SkylieStyle>({})
  const scroller = useRef<HTMLDivElement>(null)

  // Responsive: tuck Skylie smaller / out of the way on narrow screens.
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(KF_ID)) return
    const st = document.createElement('style'); st.id = KF_ID
    st.textContent = `
      .skylie-wrap{position:relative}
      .skylie-portrait{position:absolute;right:-18px;bottom:0;height:min(78%,440px);z-index:3;pointer-events:none;filter:drop-shadow(0 6px 22px rgba(0,0,0,.5))}
      .skylie-chat{padding-right:200px}
      @media(max-width:720px){.skylie-portrait{height:220px;right:-10px;opacity:.85}.skylie-chat{padding-right:96px}}
      @media(max-width:480px){.skylie-portrait{height:150px;opacity:.6}.skylie-chat{padding-right:40px}}
    `
    document.head.appendChild(st)
  }, [])

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMsgs(m => [...m, { role: 'me', text }])
    setBusy(true)
    try {
      const { reply, style: st } = await askSkylie(text)
      if (st) setStyle(st)
      setMsgs(m => [...m, { role: 'skylie', text: reply }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'skylie', text: e instanceof Error ? e.message : 'Something went wrong.' }])
    } finally {
      setBusy(false)
    }
  }

  const bubbleBg = style.bubbleBackgroundColor || '#553C9A'
  const bubbleBorder = style.bubbleBorderColor || '#6B46C1'
  const bubbleText = style.bubbleTextColor || '#ffffff'

  return (
    <>
      <PageHead title="Assistant" desc="Chat with Skylie, your Alien Worlds guide." />

      <div className="skylie-wrap">
        <section style={{
          background: 'var(--aww-surface, #14141c)', border: '1px solid var(--aww-border, rgba(255,255,255,.12))',
          borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 560,
          boxShadow: '0 0 40px color-mix(in srgb, var(--aww-primary, #8b5cf6) 22%, transparent)',
        }}>
          <div ref={scroller} className="skylie-chat" style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '62vh' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'me' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div style={{
                  padding: '9px 13px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  ...(m.role === 'me'
                    ? { background: 'color-mix(in srgb, var(--aww-primary, #8b5cf6) 30%, transparent)', color: 'var(--aww-text)', borderBottomRightRadius: 4 }
                    : { background: bubbleBg, color: bubbleText, border: `1px solid ${bubbleBorder}`, borderBottomLeftRadius: 4 }),
                }}>{m.text}</div>
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--aww-text-muted, #9aa)', fontStyle: 'italic', padding: '2px 4px' }}>
                Skylie is thinking…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--aww-border, rgba(255,255,255,.1))' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Ask Skylie anything about Alien Worlds…"
              style={{ flex: 1, padding: '11px 13px', borderRadius: 10, fontSize: 14, background: 'color-mix(in srgb, var(--aww-text-muted) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)', color: 'var(--aww-text)' }}
            />
            <button onClick={send} disabled={busy || !input.trim()}
              style={{ padding: '0 18px', borderRadius: 10, border: 'none', fontWeight: 800, color: '#fff', cursor: busy || !input.trim() ? 'default' : 'pointer',
                background: busy || !input.trim() ? 'color-mix(in srgb, var(--aww-text-muted) 30%, transparent)' : 'linear-gradient(135deg, var(--aww-primary, #8b5cf6), color-mix(in srgb, var(--aww-primary, #8b5cf6) 60%, #4be1c2))' }}>
              Send
            </button>
          </div>
        </section>

        <img className="skylie-portrait" src={style.avatarUrl || SKYLIE_AVATAR} alt="Skylie" crossOrigin="anonymous" />
      </div>
    </>
  )
}
