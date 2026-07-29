/**
 * AWW design tokens + skins.
 *
 * Every visual value in the wallet is a CSS variable defined here. Changing a
 * token restyles the whole UI. Skins are named token presets the user can switch
 * between (the "wallet skins" feature). The DEFAULT skin reproduces the LW-SSO
 * palette so AWW starts life looking like the existing SSO, per Geoff.
 *
 * The token keys deliberately mirror the SSO LoginTheme concept (primary / bg /
 * surface / text / border / radius / font) so the same values can later be fed
 * from the SSO admin ThemeEditor + persisted per-app.
 */

export type ThemeVars = {
  '--aww-font': string
  '--aww-bg': string
  '--aww-surface': string   // sidebar, top bar, cards
  '--aww-surface-2': string // insets: stats, inputs, tiles
  '--aww-border': string
  '--aww-text': string
  '--aww-text-dim': string
  '--aww-text-muted': string
  '--aww-primary': string
  '--aww-primary-hover': string
  '--aww-radius': string
}

export type Skin = { id: string; name: string; vars: ThemeVars }

/** DEFAULT = LW-SSO palette (kept as the initial look). */
const LW_SSO: ThemeVars = {
  '--aww-font': "'Open Sans', system-ui, sans-serif",
  '--aww-bg': '#3b3b3b',
  '--aww-surface': '#2a2a2c',
  '--aww-surface-2': '#1f1f21',
  '--aww-border': '#4c4946',
  '--aww-text': '#e4dad1',
  '--aww-text-dim': '#bab1a8',
  '--aww-text-muted': '#7a7572',
  '--aww-primary': '#6a24fa',
  '--aww-primary-hover': '#7f4ae8',
  '--aww-radius': '8px',
}

export const SKINS: Skin[] = [
  { id: 'lw-sso', name: 'LW-SSO (default)', vars: LW_SSO },
  {
    id: 'alien-dark',
    name: 'Alien Worlds Dark',
    vars: {
      '--aww-font': "'Inter', system-ui, sans-serif",
      '--aww-bg': '#0a0e1a',
      '--aww-surface': '#0e1424',
      '--aww-surface-2': '#0b101d',
      '--aww-border': '#1e2740',
      '--aww-text': '#e7ecf3',
      '--aww-text-dim': '#9aa4b2',
      '--aww-text-muted': '#6b7688',
      '--aww-primary': '#4d9dff',
      '--aww-primary-hover': '#6a7bff',
      '--aww-radius': '12px',
    },
  },
  {
    id: 'trilium',
    name: 'Trilium Green',
    vars: {
      '--aww-font': "'Inter', system-ui, sans-serif",
      '--aww-bg': '#0a120d',
      '--aww-surface': '#101a13',
      '--aww-surface-2': '#0c140f',
      '--aww-border': '#1c2a20',
      '--aww-text': '#eaf5ee',
      '--aww-text-dim': '#9ec4ab',
      '--aww-text-muted': '#5f7a68',
      '--aww-primary': '#28c76f',
      '--aww-primary-hover': '#34e07f',
      '--aww-radius': '10px',
    },
  },
  {
    id: 'nebula',
    name: 'Nebula Purple',
    vars: {
      '--aww-font': "'Inter', system-ui, sans-serif",
      '--aww-bg': '#0f0a1e',
      '--aww-surface': '#160f2c',
      '--aww-surface-2': '#120c24',
      '--aww-border': '#2a1f45',
      '--aww-text': '#f0eaff',
      '--aww-text-dim': '#b6a9d9',
      '--aww-text-muted': '#7a6ba0',
      '--aww-primary': '#c774f0',
      '--aww-primary-hover': '#d68bff',
      '--aww-radius': '14px',
    },
  },
]

export const DEFAULT_SKIN_ID = 'lw-sso'
export const defaultVars = (): ThemeVars => ({ ...LW_SSO })

/** Controls rendered in the live Styling panel. */
export const COLOR_CONTROLS: { key: keyof ThemeVars; label: string }[] = [
  { key: '--aww-primary', label: 'Primary / accent' },
  { key: '--aww-bg', label: 'Background' },
  { key: '--aww-surface', label: 'Panels' },
  { key: '--aww-surface-2', label: 'Tiles / insets' },
  { key: '--aww-text', label: 'Text' },
  { key: '--aww-text-dim', label: 'Text dim' },
  { key: '--aww-border', label: 'Borders' },
]

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Rounded', value: "'Segoe UI', 'Nunito', system-ui, sans-serif" },
  { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Mono', value: "'SF Mono', ui-monospace, monospace" },
]
