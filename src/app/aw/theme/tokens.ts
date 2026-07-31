/**
 * AWW design tokens + skins.
 *
 * Every visual value in the wallet is a CSS variable defined here. Distinct,
 * independently-editable surface layers (outer → inner):
 *   --aww-bg        page background (behind the app)
 *   --aww-nav       left navigation background
 *   --aww-surface   main panel (the content base + top bar)
 *   --aww-surface-2 sub-panels / cards sitting on the main panel
 *   --aww-surface-3 tiles / insets inside cards (stats, inputs, review boxes)
 *
 * The surface layers are now *translucent glass* in the stylesheet: each layer
 * paints its token color, then a hairline highlight and a backdrop blur on top,
 * so the nebula behind the app reads faintly through the whole stack.
 *
 * WEB FONTS REQUIRED (see note at the bottom of this file):
 *   Chakra Petch (500/600/700) · Inter (400/500/600/700) ·
 *   JetBrains Mono (500/700) · Bangers (400, comic bubbles only)
 */

export type ThemeVars = {
  '--aww-font': string
  '--aww-font-head': string
  '--aww-font-mono': string
  '--aww-font-comic': string
  '--aww-h1-size': string
  '--aww-h2-size': string
  '--aww-text-size': string
  '--aww-bg': string
  '--aww-nav': string
  '--aww-surface': string
  '--aww-surface-2': string
  '--aww-surface-3': string
  '--aww-border': string
  '--aww-text': string
  '--aww-text-dim': string
  '--aww-text-muted': string
  '--aww-primary': string
  '--aww-primary-hover': string
  '--aww-radius': string
  /* --- added for the HUD / glass treatment --- */
  '--aww-accent-2': string
  '--aww-glow': string
  '--aww-glow-2': string
  '--aww-hairline': string
  '--aww-glass': string
  '--aww-blur': string
  '--aww-nebula-1': string
  '--aww-nebula-2': string
  '--aww-grid': string
  '--aww-shadow': string
  '--aww-success': string
  '--aww-danger': string
  /* circuit texture on sub-panels. Set --aww-texture to `none` to remove it. */
  '--aww-texture': string
  '--aww-texture-size': string
  '--aww-texture-opacity': string
}

export type Skin = { id: string; name: string; vars: ThemeVars }

const TYPE = { '--aww-h1-size': '26px', '--aww-h2-size': '19px', '--aww-text-size': '14px' }

const TEXTURE = {
  /* point this at wherever you host the circuit tile */
  '--aww-texture': "url('/aw/textures/circuit-board.webp')",
  '--aww-texture-size': '420px',
  '--aww-texture-opacity': '0.15',
}

const FONTS = {
  '--aww-font': "'Inter', system-ui, sans-serif",
  '--aww-font-head': "'Chakra Petch', 'Inter', system-ui, sans-serif",
  '--aww-font-mono': "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
  '--aww-font-comic': "'Bangers', 'Chakra Petch', system-ui, sans-serif",
}

/** DEFAULT = LW-SSO palette. Warm-grey character + the house purple, deepened
 *  so glows have somewhere dark to sit. */
const LW_SSO: ThemeVars = {
  ...FONTS,
  ...TYPE,
  ...TEXTURE,
  '--aww-bg': '#1c1a1e',
  '--aww-nav': '#201e23',
  '--aww-surface': '#26242a',
  '--aww-surface-2': '#302d35',
  '--aww-surface-3': '#1b191e',
  '--aww-border': '#494349',
  '--aww-text': '#efe6dd',
  '--aww-text-dim': '#c0b6ac',
  '--aww-text-muted': '#948a83',
  '--aww-primary': '#7c3cff',
  '--aww-primary-hover': '#9d6bff',
  '--aww-radius': '10px',
  '--aww-accent-2': '#ffb457',
  '--aww-glow': 'rgba(124, 60, 255, 0.55)',
  '--aww-glow-2': 'rgba(255, 180, 87, 0.45)',
  '--aww-hairline': 'rgba(255, 244, 232, 0.10)',
  '--aww-glass': 'rgba(255, 244, 232, 0.045)',
  '--aww-blur': '18px',
  '--aww-nebula-1': 'rgba(124, 60, 255, 0.30)',
  '--aww-nebula-2': 'rgba(255, 138, 66, 0.16)',
  '--aww-grid': 'rgba(255, 240, 226, 0.045)',
  '--aww-shadow': 'rgba(6, 3, 10, 0.62)',
  '--aww-success': '#3ee08a',
  '--aww-danger': '#ff6b7d',
}

const ALIEN_DARK: ThemeVars = {
  ...FONTS,
  ...TYPE,
  ...TEXTURE,
  '--aww-bg': '#060a16',
  '--aww-nav': '#080e1d',
  '--aww-surface': '#0c1324',
  '--aww-surface-2': '#152039',
  '--aww-surface-3': '#080e1e',
  '--aww-border': '#25314f',
  '--aww-text': '#eaf1fb',
  '--aww-text-dim': '#9fb0c8',
  '--aww-text-muted': '#6c7d96',
  '--aww-primary': '#3d9bff',
  '--aww-primary-hover': '#7a6bff',
  '--aww-radius': '12px',
  '--aww-accent-2': '#3ff0d8',
  '--aww-glow': 'rgba(61, 155, 255, 0.55)',
  '--aww-glow-2': 'rgba(63, 240, 216, 0.40)',
  '--aww-hairline': 'rgba(214, 236, 255, 0.11)',
  '--aww-glass': 'rgba(190, 220, 255, 0.05)',
  '--aww-blur': '20px',
  '--aww-nebula-1': 'rgba(61, 155, 255, 0.28)',
  '--aww-nebula-2': 'rgba(122, 107, 255, 0.22)',
  '--aww-grid': 'rgba(180, 214, 255, 0.05)',
  '--aww-shadow': 'rgba(0, 4, 14, 0.70)',
  '--aww-success': '#2fe08a',
  '--aww-danger': '#ff6b7d',
}

const TRILIUM: ThemeVars = {
  ...FONTS,
  ...TYPE,
  ...TEXTURE,
  '--aww-bg': '#060f0a',
  '--aww-nav': '#08130d',
  '--aww-surface': '#0d1a12',
  '--aww-surface-2': '#15271b',
  '--aww-surface-3': '#081310',
  '--aww-border': '#23402c',
  '--aww-text': '#ecf8f0',
  '--aww-text-dim': '#a3c9b1',
  '--aww-text-muted': '#67846f',
  '--aww-primary': '#22d97a',
  '--aww-primary-hover': '#5cf2a4',
  '--aww-radius': '10px',
  '--aww-accent-2': '#c9f24d',
  '--aww-glow': 'rgba(34, 217, 122, 0.50)',
  '--aww-glow-2': 'rgba(201, 242, 77, 0.35)',
  '--aww-hairline': 'rgba(224, 255, 236, 0.10)',
  '--aww-glass': 'rgba(200, 255, 224, 0.045)',
  '--aww-blur': '18px',
  '--aww-nebula-1': 'rgba(34, 217, 122, 0.24)',
  '--aww-nebula-2': 'rgba(201, 242, 77, 0.14)',
  '--aww-grid': 'rgba(190, 255, 214, 0.05)',
  '--aww-shadow': 'rgba(0, 12, 6, 0.68)',
  '--aww-success': '#22d97a',
  '--aww-danger': '#ff6b7d',
}

const NEBULA: ThemeVars = {
  ...FONTS,
  ...TYPE,
  ...TEXTURE,
  '--aww-bg': '#0c0718',
  '--aww-nav': '#100a20',
  '--aww-surface': '#150d29',
  '--aww-surface-2': '#20153f',
  '--aww-surface-3': '#110a22',
  '--aww-border': '#342552',
  '--aww-text': '#f3ecff',
  '--aww-text-dim': '#bcadde',
  '--aww-text-muted': '#8073a6',
  '--aww-primary': '#c774f0',
  '--aww-primary-hover': '#e79bff',
  '--aww-radius': '14px',
  '--aww-accent-2': '#63e6ff',
  '--aww-glow': 'rgba(199, 116, 240, 0.55)',
  '--aww-glow-2': 'rgba(99, 230, 255, 0.40)',
  '--aww-hairline': 'rgba(244, 232, 255, 0.12)',
  '--aww-glass': 'rgba(238, 224, 255, 0.05)',
  '--aww-blur': '22px',
  '--aww-nebula-1': 'rgba(199, 116, 240, 0.30)',
  '--aww-nebula-2': 'rgba(99, 230, 255, 0.18)',
  '--aww-grid': 'rgba(232, 214, 255, 0.05)',
  '--aww-shadow': 'rgba(6, 0, 18, 0.70)',
  '--aww-success': '#3ee08a',
  '--aww-danger': '#ff6b7d',
}

export const SKINS: Skin[] = [
  { id: 'lw-sso', name: 'LW-SSO (default)', vars: LW_SSO },
  { id: 'alien-dark', name: 'Alien Worlds Dark', vars: ALIEN_DARK },
  { id: 'trilium', name: 'Trilium Green', vars: TRILIUM },
  { id: 'nebula', name: 'Nebula Purple', vars: NEBULA },
]

export const DEFAULT_SKIN_ID = 'lw-sso'
export const defaultVars = (): ThemeVars => ({ ...LW_SSO })

/** Controls rendered in the live Styling panel. */
export const COLOR_CONTROLS: { key: keyof ThemeVars; label: string }[] = [
  { key: '--aww-primary', label: 'Primary / accent' },
  { key: '--aww-accent-2', label: 'Secondary / HUD accent' },
  { key: '--aww-bg', label: 'Background' },
  { key: '--aww-nav', label: 'Left nav' },
  { key: '--aww-surface', label: 'Main panel' },
  { key: '--aww-surface-2', label: 'Sub-panel (cards)' },
  { key: '--aww-surface-3', label: 'Tiles / insets' },
  { key: '--aww-text', label: 'Text' },
  { key: '--aww-text-dim', label: 'Text dim' },
  { key: '--aww-text-muted', label: 'Secondary text (hints)' },
  { key: '--aww-border', label: 'Borders' },
]

/** Standard app font stacks. Uncommon families fall back to system fonts. */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Chakra Petch (HUD)', value: "'Chakra Petch', 'Inter', system-ui, sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Lato', value: "'Lato', system-ui, sans-serif" },
  { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Rounded', value: "'Segoe UI', 'Nunito', system-ui, sans-serif" },
  { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Mono', value: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace" },
]

export const H1_SIZES = ['20px', '22px', '24px', '26px', '28px', '32px', '36px']
export const H2_SIZES = ['14px', '16px', '18px', '19px', '20px', '22px']
export const TEXT_SIZES = ['13px', '14px', '15px', '16px', '17px']

/**
 * Map our tokens onto the SSO `--lw-*` variables so reused SSO components
 * (NftGrid, comic/webtoon reader) theme with the active skin.
 */
export function lwVarsFrom(v: ThemeVars): Record<string, string> {
  return {
    '--lw-purple': v['--aww-primary'],
    '--lw-purple-hover': v['--aww-primary-hover'],
    '--lw-wallet-row-bg': v['--aww-surface-2'],
    '--lw-text-white': v['--aww-text'],
    '--lw-text-secondary': v['--aww-text-dim'],
    '--lw-text-muted': v['--aww-text-muted'],
    '--lw-accent': v['--aww-primary'],
    '--lw-border': v['--aww-border'],
    '--lw-radius-sm': v['--aww-radius'],
    '--nft-card-bg': v['--aww-surface-2'],
    '--nft-thumb-bg': v['--aww-surface-3'],
  }
}

/**
 * WEB FONTS — add to your document <head> (or next/font):
 * https://fonts.googleapis.com/css2
 *   ?family=Chakra+Petch:wght@500;600;700
 *   &family=Inter:wght@400;500;600;700
 *   &family=JetBrains+Mono:wght@500;700
 *   &family=Bangers
 *   &display=swap
 */
