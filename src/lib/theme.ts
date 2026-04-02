/**
 * Login Page Theme System
 *
 * Priority: URL params > app theme > company theme > defaults
 */

export interface LoginTheme {
  primary_color?: string       // buttons, links, accents
  primary_hover_color?: string // button hover state
  bg_color?: string            // page background color
  panel_bg_color?: string      // login panel background
  text_color?: string          // primary text color
  text_secondary_color?: string // subtitle/muted text
  input_bg_color?: string      // form input background
  input_text_color?: string    // form input text color
  divider_color?: string       // divider lines
  border_radius?: string       // corner radius (e.g. '8px', '5px')
  font_family?: string         // body font (e.g. 'Open Sans', 'Inter')
  font_size?: string           // base font size (e.g. '16px')
}

export const DEFAULT_THEME: Required<LoginTheme> = {
  primary_color: '#6a24fa',
  primary_hover_color: '#7f4ae8',
  bg_color: '#0c0b0b',
  panel_bg_color: 'rgba(0, 0, 0, 0.8)',
  text_color: '#e4dad1',
  text_secondary_color: '#bab1a8',
  input_bg_color: 'rgba(26, 17, 46, 1)',
  input_text_color: '#bab1a8',
  divider_color: '#4c4946',
  border_radius: '8px',
  font_family: "'Open Sans', sans-serif",
  font_size: '16px',
}

/** All theme keys that can be set */
export const THEME_KEYS = Object.keys(DEFAULT_THEME) as (keyof LoginTheme)[]

/**
 * Merge themes: URL params > app > company > defaults
 */
export function mergeThemes(
  companyTheme?: LoginTheme | null,
  appTheme?: LoginTheme | null,
  urlOverrides?: LoginTheme | null,
): Required<LoginTheme> {
  return {
    ...DEFAULT_THEME,
    ...stripUndefined(companyTheme),
    ...stripUndefined(appTheme),
    ...stripUndefined(urlOverrides),
  }
}

function stripUndefined(obj?: LoginTheme | null): Partial<LoginTheme> {
  if (!obj) return {}
  const result: Partial<LoginTheme> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null && val !== '') {
      (result as Record<string, string>)[key] = val
    }
  }
  return result
}

/**
 * Extract theme overrides from URL search params
 */
export function themeFromSearchParams(params: URLSearchParams): LoginTheme {
  const theme: LoginTheme = {}
  for (const key of THEME_KEYS) {
    const val = params.get(key)
    if (val) {
      (theme as Record<string, string>)[key] = val
    }
  }
  return theme
}

/**
 * Generate a CSS style block to inject for the merged theme
 */
export function themeToCssVars(theme: Required<LoginTheme>): string {
  return `
    :root {
      --lw-purple: ${theme.primary_color};
      --lw-purple-hover: ${theme.primary_hover_color};
      --lw-bg-page: ${theme.bg_color};
      --lw-panel: ${theme.panel_bg_color};
      --lw-text-primary: ${theme.text_color};
      --lw-text-secondary: ${theme.text_secondary_color};
      --lw-input-bg: ${theme.input_bg_color};
      --lw-border: ${theme.divider_color};
      --lw-radius: ${theme.border_radius};
      --lw-radius-sm: ${theme.border_radius};
      --lw-font-body: ${theme.font_family};
    }
    body {
      font-size: ${theme.font_size};
    }
    .lw-input, .lw-input:focus, .lw-input:active,
    input[type="email"].lw-input, input[type="password"].lw-input, input[type="text"].lw-input {
      background-color: ${theme.input_bg_color} !important;
      color: ${theme.input_text_color} !important;
      -webkit-text-fill-color: ${theme.input_text_color} !important;
      border-radius: ${theme.border_radius} !important;
    }
    .lw-input:-webkit-autofill,
    .lw-input:-webkit-autofill:hover,
    .lw-input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 1000px ${theme.input_bg_color} inset !important;
      -webkit-text-fill-color: ${theme.input_text_color} !important;
    }
    .lw-input::placeholder {
      color: ${theme.text_secondary_color} !important;
      -webkit-text-fill-color: ${theme.text_secondary_color} !important;
      opacity: 0.7 !important;
    }
    .lw-btn-primary {
      background-color: ${theme.primary_color} !important;
      border-radius: ${theme.border_radius} !important;
    }
    .lw-btn-primary:hover {
      background-color: ${theme.primary_hover_color} !important;
    }
    .lw-link {
      color: ${theme.primary_color} !important;
    }
    .lw-link:hover {
      color: ${theme.primary_hover_color} !important;
    }
    .lw-panel {
      background-color: ${theme.panel_bg_color} !important;
      border-radius: ${theme.border_radius} !important;
    }
    .lw-divider-line {
      background-color: ${theme.divider_color} !important;
    }
    .lw-divider-text {
      color: ${theme.text_secondary_color} !important;
    }
    .lw-page, .lw-account-page {
      background-color: ${theme.bg_color} !important;
      background-image: none !important;
    }
    .lw-subtitle {
      color: ${theme.text_secondary_color} !important;
    }
    .lw-footer-text {
      color: ${theme.text_secondary_color} !important;
    }
    .lw-error {
      color: #ff4444 !important;
    }
    body {
      color: ${theme.text_color} !important;
    }
    .lw-btn-google, .lw-btn-apple, .lw-btn-discord, .lw-btn-twitter, .lw-btn-wax {
      border-radius: ${theme.border_radius} !important;
    }
  `
}
