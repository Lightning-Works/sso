import type { AdminContext } from './adminContext'

/**
 * Mining Data admin gate. On top of the superadmin role, the caller's email
 * must be on an allowlist — locked to geoff@lightningworks.io by default so the
 * whole analytics suite (which stores IPs and cash-out graphs) is single-user
 * until explicitly widened via AW_MINING_ADMIN_EMAILS.
 */
const DEFAULT_ALLOW = ['geoff@lightningworks.io']

function allowlist(): string[] {
  const raw = process.env.AW_MINING_ADMIN_EMAILS
  if (!raw || !raw.trim()) return DEFAULT_ALLOW
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export function isMiningAdmin(ctx: AdminContext | null): boolean {
  if (!ctx || ctx.role !== 'superadmin') return false
  const email = (ctx.email || '').trim().toLowerCase()
  return !!email && allowlist().includes(email)
}
