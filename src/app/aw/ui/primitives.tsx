'use client'

/**
 * Shared presentational primitives. Every AWW feature composes these, so the
 * look stays consistent and one edit here propagates everywhere.
 */
import type { ReactNode } from 'react'
import s from '../aw.module.css'

export function PageHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className={s.pageHead}>
      <h1 className={s.pageTitle}>{title}</h1>
      {desc && <p className={s.pageDesc}>{desc}</p>}
    </div>
  )
}

export function Card({ title, tag, children }: { title?: string; tag?: string; children: ReactNode }) {
  const live = !!tag && tag.toLowerCase().includes('read')
  return (
    <section className={s.card}>
      {(title || tag) && (
        <div className={s.cardHead}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {tag && <span className={`${s.tag} ${live ? s.tagLive : s.tagStub}`}>{tag}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>
}

export function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className={s.stat}>
      <div className={s.statVal} title={value}>{value}</div>
      {sub && <div className={s.statUsd}>{sub}</div>}
      <div className={s.statLabel} style={color ? { color } : undefined}>{label}</div>
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className={s.empty}>{text}</p>
}

/** A labeled placeholder for features that ship in a later phase. */
export function FeatureStub({ phase, lines, actions }: { phase: string; lines: string[]; actions?: string[] }) {
  return (
    <Card tag={phase}>
      <ul className={s.stub}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {actions && actions.length > 0 && (
        <div className={s.stubActions}>
          {actions.map(a => <button key={a} className={`${s.btn} ${s.btnGhost}`} disabled title="Coming in the fork build">{a}</button>)}
        </div>
      )}
    </Card>
  )
}
