'use client'

import { useRef } from 'react'
import s from '../aw.module.css'
import { COLOR_CONTROLS, FONT_OPTIONS, SKINS, type ThemeVars } from './tokens'

/**
 * Live styling — a bottom sheet. Pick a skin, tweak any token, or download /
 * import a skin as JSON. Changes apply instantly and persist. Import is
 * validated (known token keys only) — never eval'd.
 */
export function StylingPanel({
  skinId, vars, setToken, applySkin, reset, importVars, onClose,
}: {
  skinId: string
  vars: ThemeVars
  setToken: (k: keyof ThemeVars, v: string) => void
  applySkin: (id: string) => void
  reset: () => void
  importVars: (v: Record<string, unknown>) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const radius = parseInt(vars['--aww-radius'], 10) || 8

  const download = () => {
    const blob = new Blob([JSON.stringify(vars, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'aww-skin.json'; a.click()
    URL.revokeObjectURL(url)
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(t => { try { importVars(JSON.parse(t)) } catch { /* ignore bad file */ } })
    e.target.value = ''
  }

  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.sheet}>
        <div className={s.sheetHead}>
          <span className={s.drawerTitle}>Styling &amp; Skins</span>
          <select className={s.select} style={{ width: 'auto' }} value={skinId} onChange={e => applySkin(e.target.value)}>
            {SKINS.map(sk => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
          </select>
          <button className={`${s.btn} ${s.btnGhost}`} onClick={download}>Download skin</button>
          <button className={`${s.btn} ${s.btnGhost}`} onClick={() => fileRef.current?.click()}>Import skin</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
          <button className={`${s.btn} ${s.btnGhost}`} onClick={reset}>Reset</button>
          <button className={s.iconBtn} style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={s.sheetGrid}>
          {COLOR_CONTROLS.map(c => (
            <div className={s.field} key={c.key}>
              <label className={s.fieldLabel}>{c.label}</label>
              <div className={s.colorRow}>
                <input className={s.swatch} type="color" value={vars[c.key]} onChange={e => setToken(c.key, e.target.value)} />
                <input className={s.input} value={vars[c.key]} onChange={e => setToken(c.key, e.target.value)} />
              </div>
            </div>
          ))}
          <div className={s.field}>
            <label className={s.fieldLabel}>Font</label>
            <select className={s.select} value={vars['--aww-font']} onChange={e => setToken('--aww-font', e.target.value)}>
              {FONT_OPTIONS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Corner radius — {radius}px</label>
            <input className={s.range} type="range" min={0} max={20} value={radius} onChange={e => setToken('--aww-radius', `${e.target.value}px`)} />
          </div>
        </div>
      </aside>
    </>
  )
}
