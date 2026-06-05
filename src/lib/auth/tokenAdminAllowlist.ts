import type { AdminContext } from './adminContext'

/**
 * Second factor for the most sensitive admin action — registering a token a
 * user could be told to send money to. On top of the superadmin role, the
 * caller's email must be on an env allowlist.
 *
 *   DIVIGO_TOKEN_ADMIN_EMAILS — comma-separated emails permitted to manage
 *                               custom tokens. Defaults to geoff@lightningworks.io
 *                               if unset, so the feature is locked down even
 *                               before the env var is configured.
 *
 * Email (not IP) was chosen deliberately: it survives a laptop IP change,
 * travel, and VPNs, while staying just as tight. To further restrict to a
 * single machine later, add an IP check in front of this.
 */
const DEFAULT_ALLOWLIST = ['geoff@lightningworks.io']

function allowlist(): string[] {
  const raw = process.env.DIVIGO_TOKEN_ADMIN_EMAILS
  if (!raw || !raw.trim()) return DEFAULT_ALLOWLIST
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

/** True only for a superadmin whose email is on the token-admin allowlist. */
export function isTokenAdmin(ctx: AdminContext | null): boolean {
  if (!ctx || ctx.role !== 'superadmin') return false
  const email = (ctx.email || '').trim().toLowerCase()
  return !!email && allowlist().includes(email)
}
