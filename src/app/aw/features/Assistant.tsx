'use client'

/**
 * Assistant — Skylie. The chat is the Kinet.ink embed iframe (styled speech
 * bubbles with a tail, circular avatar, her own colours), with her full-body
 * transparent image set on the right, overlapping the panel's right edge. Mirrors
 * the SSO wallet's character-chat pattern.
 */
import { useEffect } from 'react'
import { PageHead } from '../ui/primitives'
import { skylieEmbedUrl, SKYLIE_SIDE_IMG } from '../lib/aw/skylie'
import type { FeatureProps } from './ctx'

const KF_ID = 'skylie-layout'

export default function Assistant({ account }: FeatureProps) {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(KF_ID)) return
    const st = document.createElement('style'); st.id = KF_ID
    st.textContent = `
      .skylie-row{display:flex;align-items:stretch}
      .skylie-panel{flex:1;min-width:0;border:1px solid var(--aww-border,rgba(255,255,255,.12));border-radius:14px;overflow:hidden;background:#14141c;box-shadow:0 0 40px color-mix(in srgb,var(--aww-primary,#8b5cf6) 22%,transparent)}
      .skylie-frame{width:100%;height:min(74vh,680px);border:0;display:block}
      /* Full-body Skylie: bottom-aligned, pulled left so she overlaps the panel's right edge; hidden on small screens. */
      .skylie-side{display:none;align-self:flex-end;margin-left:-55px;z-index:5;pointer-events:none;flex-shrink:0}
      .skylie-side img{height:min(74vh,680px);object-fit:contain;display:block;filter:drop-shadow(0 8px 26px rgba(0,0,0,.55))}
      @media(min-width:1024px){.skylie-side{display:block}}
    `
    document.head.appendChild(st)
  }, [])

  return (
    <>
      <PageHead title="Assistant" desc="Chat with Skylie, your Alien Worlds guide." />
      <div className="skylie-row">
        <section className="skylie-panel">
          <iframe
            className="skylie-frame"
            src={skylieEmbedUrl({ userId: account || undefined, userName: account || undefined })}
            title="Chat with Skylie"
            allow="clipboard-write"
          />
        </section>
        <div className="skylie-side">
          <img src={SKYLIE_SIDE_IMG} alt="Skylie" />
        </div>
      </div>
    </>
  )
}
