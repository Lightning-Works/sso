'use client'

import s from '../aw.module.css'
import { COLOR_CONTROLS, FONT_OPTIONS, SKINS, type ThemeVars } from './tokens'

/**
 * Live styling drawer — pick a skin or tweak individual tokens; changes apply
 * to the whole wallet instantly and persist. This is the player-facing half of
 * the "wallet skins" feature; the same tokens can also be driven from the SSO
 * admin ThemeEditor in the shipped build.
 */
export function StylingPanel({
  skinId, vars, setToken, applySkin, reset, onClose,
}: {
  skinId: string
  vars: ThemeVars
  setToken: (k: keyof ThemeVars, v: string) => void
  applySkin: (id: string) => void
  reset: () => void
  onClose: () => void
}) {
  const radius = parseInt(vars['--aww-radius'], 10) || 8

  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.drawer}>
        <div className={s.drawerHead}>
          <span className={s.drawerTitle}>Styling</span>
          <button className={s.iconBtn} style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className={s.drawerNote}>Pick a skin or fine-tune any token. Everything updates live and is remembered on this device.</p>

        <div className={s.field}>
          <label className={s.fieldLabel}>Skin</label>
          <select className={s.select} value={skinId} onChange={e => applySkin(e.target.value)}>
            {SKINS.map(sk => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
          </select>
        </div>

        {COLOR_CONTROLS.map(c => (
          <div className={s.field} key={c.key}>
            <label className={s.fieldLabel}>{c.label}</label>
            <div className={s.colorRow}>
              <input
                className={s.swatch}
                type="color"
                value={vars[c.key]}
                onChange={e => setToken(c.key, e.target.value)}
              />
              <input
                className={s.input}
                value={vars[c.key]}
                onChange={e => setToken(c.key, e.target.value)}
              />
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
          <input
            className={s.range}
            type="range" min={0} max={20} value={radius}
            onChange={e => setToken('--aww-radius', `${e.target.value}px`)}
          />
        </div>

        <button className={`${s.btn} ${s.btnGhost}`} style={{ width: '100%', marginTop: 6 }} onClick={reset}>
          Reset to default
        </button>
      </aside>
    </>
  )
}
