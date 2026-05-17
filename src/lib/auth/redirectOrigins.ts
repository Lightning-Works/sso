/**
 * Shared redirect / CORS origin validation.
 *
 * Security: the SSO returns a logged-in user's access + refresh tokens to
 * the `redirect` target, so that target MUST be matched against a known
 * allow-list — otherwise any crafted `?redirect=` link exfiltrates tokens
 * (account takeover). See docs/SECURITY-INCIDENT-REPORT.md.
 *
 * Allow-list sources, unioned:
 *   1. Per-app `apps.redirect_origins` (managed in the admin panel — lets a
 *      client be onboarded without an env change or redeploy).
 *   2. The ALLOWED_REDIRECT_ORIGINS / NEXT_PUBLIC_ALLOWED_REDIRECT_ORIGINS
 *      env list (global fallback, keeps existing integrations working).
 *
 * Pattern syntax per entry:
 *   - exact origin:        https://app.example.com
 *   - wildcard subdomain:  https://*.example.com   (matches base + any sub)
 *   - http://localhost:<any port> is always allowed (local dev).
 *
 * No Node-only APIs here — safe to import from client and server code.
 */

/** True if `url`'s origin matches any of the given patterns. */
export function originMatchesPatterns(url: string, patterns: string[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()

  // Any localhost port for local dev.
  if (parsed.protocol === 'http:' && host === 'localhost') return true
  // Only https for non-localhost.
  if (parsed.protocol !== 'https:') return false

  for (const raw of patterns) {
    const pattern = raw.trim().toLowerCase()
    if (!pattern) continue
    try {
      if (pattern.includes('*')) {
        const patternUrl = new URL(pattern.replace('*', '_wildcard_'))
        const baseDomain = patternUrl.hostname.replace('_wildcard_.', '')
        if (host === baseDomain || host.endsWith('.' + baseDomain)) return true
      } else if (parsed.origin.toLowerCase() === new URL(pattern).origin.toLowerCase()) {
        return true
      }
    } catch {
      continue
    }
  }
  return false
}

/** Parse a comma-separated env value into a pattern list. */
export function parseEnvOrigins(env: string | undefined | null): string[] {
  if (!env) return []
  return env.split(',').map(o => o.trim()).filter(Boolean)
}

/**
 * True if `url` is an allowed redirect target for this request: matches the
 * app's own `redirect_origins`, or the global env fallback list.
 */
export function isRedirectAllowed(
  url: string | null | undefined,
  appRedirectOrigins: string[] | null | undefined,
  envValue: string | undefined | null,
): boolean {
  if (!url) return false
  const patterns = [
    ...(appRedirectOrigins ?? []),
    ...parseEnvOrigins(envValue),
  ]
  if (patterns.length === 0) return false
  return originMatchesPatterns(url, patterns)
}
