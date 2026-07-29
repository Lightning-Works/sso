'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SKIN_ID, SKINS, defaultVars, type ThemeVars } from './tokens'

const STORAGE_KEY = 'aww-theme-v1'

type Saved = { skinId: string; overrides: Partial<ThemeVars> }

/**
 * Theme state for the wallet. Resolves to a set of CSS variables that get
 * applied to the app root element, so the whole UI restyles live. A skin is a
 * preset; overrides are per-token tweaks layered on top. Persisted to
 * localStorage (in the shipped fork this can move to the SSO per-app theme).
 */
export function useTheme() {
  const [skinId, setSkinId] = useState<string>(DEFAULT_SKIN_ID)
  const [overrides, setOverrides] = useState<Partial<ThemeVars>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw) as Saved
        if (s.skinId) setSkinId(s.skinId)
        if (s.overrides) setOverrides(s.overrides)
      }
    } catch { /* ignore */ }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ skinId, overrides } as Saved)) } catch { /* ignore */ }
  }, [skinId, overrides, ready])

  const skinVars = SKINS.find(s => s.id === skinId)?.vars ?? defaultVars()
  const vars: ThemeVars = { ...defaultVars(), ...skinVars, ...overrides }

  const setToken = useCallback((key: keyof ThemeVars, value: string) => {
    setOverrides(o => ({ ...o, [key]: value }))
  }, [])

  const applySkin = useCallback((id: string) => {
    setSkinId(id)
    setOverrides({}) // a skin is a clean slate
  }, [])

  const reset = useCallback(() => { setSkinId(DEFAULT_SKIN_ID); setOverrides({}) }, [])

  /** Import a skin (validated: only known token keys, short string values). */
  const importVars = useCallback((incoming: Record<string, unknown>) => {
    const keys = Object.keys(defaultVars()) as (keyof ThemeVars)[]
    const clean: Partial<ThemeVars> = {}
    for (const k of keys) {
      const val = incoming[k]
      if (typeof val === 'string' && val.length > 0 && val.length < 120) clean[k] = val
    }
    if (Object.keys(clean).length) setOverrides(o => ({ ...o, ...clean }))
  }, [])

  return { skinId, vars, setToken, applySkin, reset, importVars, ready }
}
