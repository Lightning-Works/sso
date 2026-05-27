/**
 * OAuth-style auth helpers for `/api/oauth/divigo/*` routes.
 *
 * Every app→DiviGo call must satisfy ALL THREE:
 *   1. Bearer <supabase_access_token>     identifies a real user
 *   2. X-LW-App-Slug + X-LW-App-Secret    identifies a real, vetted app
 *   3. divigo_app_grants row                user has consented to THIS app
 *                                           with the required scope, and not
 *                                           revoked.
 *
 * Result: stealing one credential ≠ access. Stealing all three still leaves
 * actual fund movement gated by DiviGo's Telegram approval (their design).
 *
 * Plus: the app row must have `divigo_enabled = true` (admin flips this only
 * after vetting the app) and the user's `divigo_links` must be verified.
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createPublicClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

export type DivigoScope = 'balance:read' | 'send:request'
export const ALL_SCOPES: DivigoScope[] = ['balance:read', 'send:request']

interface AppRow {
  id: number
  slug: string
  name: string
  divigo_enabled: boolean
  api_secret_hash: string | null
}

export interface AuthedAppContext {
  user: { id: string; email?: string }
  app: AppRow
  grant: { id: string; scopes: string[] }
  /** Optional idempotency key from header — propagate to downstream writes. */
  idempotencyKey: string | null
}

/** Typed failure with a status code so route handlers can `return err.toResponse()`. */
export class OAuthError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code)
    this.name = 'OAuthError'
  }
  toResponse() {
    return NextResponse.json({ error: this.code, message: this.message }, { status: this.status })
  }
}

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** sha256(secret) → hex, lowercase, for storage + compare. */
function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Constant-time compare for two hex strings of equal length. */
function safeEqHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/**
 * Resolve the Supabase user from a `Authorization: Bearer <token>` header.
 * We use a fresh client with the bearer attached (NOT the cookie session)
 * because these calls come from app backends, not the SSO browser.
 */
async function userFromBearer(request: Request): Promise<{ id: string; email?: string } | null> {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) {
    // Fall back to the cookie session in case the call came from inside SSO
    // (e.g. testing). Apps should always send the bearer.
    const cookieSupa = await createServerClient()
    const { data: { user } } = await cookieSupa.auth.getUser()
    return user ? { id: user.id, email: user.email || undefined } : null
  }
  const token = m[1].trim()
  const sb = createPublicClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: { user } } = await sb.auth.getUser()
  return user ? { id: user.id, email: user.email || undefined } : null
}

/**
 * Single check used by every app-mediated route. Verifies user, app, and
 * grant. Returns the resolved context or throws OAuthError.
 *
 *   requiredScope — the scope the caller's route needs (e.g. 'balance:read')
 *                   or null for routes that only need user+app (currently none).
 */
export async function withAppAndUser(
  request: Request,
  requiredScope: DivigoScope,
): Promise<AuthedAppContext> {
  // 1) User
  const user = await userFromBearer(request)
  if (!user) throw new OAuthError(401, 'unauthenticated', 'Bearer token missing or invalid')

  // 2) App
  const slug = (request.headers.get('x-lw-app-slug') || '').trim().toLowerCase()
  const secret = (request.headers.get('x-lw-app-secret') || '').trim()
  if (!slug || !secret) throw new OAuthError(401, 'app_unauthenticated', 'X-LW-App-Slug and X-LW-App-Secret are required')

  const db = svc()
  const { data: app } = await db.from('apps')
    .select('id, slug, name, divigo_enabled, api_secret_hash')
    .eq('slug', slug).maybeSingle() as { data: AppRow | null }
  if (!app) throw new OAuthError(401, 'app_unauthenticated', 'Unknown app slug')
  if (!app.api_secret_hash || !safeEqHex(app.api_secret_hash, sha256hex(secret))) {
    throw new OAuthError(401, 'app_unauthenticated', 'App secret mismatch')
  }
  if (!app.divigo_enabled) {
    throw new OAuthError(403, 'app_not_enabled', 'This app is not authorised for DiviGo wallet access')
  }

  // 3) Grant
  const { data: grant } = await db.from('divigo_app_grants')
    .select('id, scopes, revoked_at')
    .eq('user_id', user.id).eq('app_id', app.id).maybeSingle()
  if (!grant || grant.revoked_at) {
    throw new OAuthError(403, 'no_grant', 'User has not granted this app DiviGo access')
  }
  const scopes = (grant.scopes || []) as string[]
  if (!scopes.includes(requiredScope)) {
    throw new OAuthError(403, 'missing_scope', `User did not grant ${requiredScope}`)
  }

  const idemRaw = request.headers.get('idempotency-key')
  const idempotencyKey = idemRaw ? idemRaw.trim().slice(0, 80) : null

  return { user, app, grant: { id: grant.id, scopes }, idempotencyKey }
}

/**
 * Per-(user, app) rate limit using the audit-log count over a time window.
 * Throws 429 if the cap is hit. Run BEFORE the actual work, then audit on
 * success — that way denied calls don't count toward the cap (which would
 * let an attacker DOS the user by exhausting their quota).
 */
export async function rateLimit(
  userId: string,
  appId: number,
  action: string,
  maxPerHour: number,
): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const db = svc()
  const { count } = await db.from('divigo_app_audit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('app_id', appId).eq('action', action).gte('created_at', hourAgo)
  if ((count || 0) >= maxPerHour) {
    throw new OAuthError(429, 'rate_limited', `Rate limit: max ${maxPerHour} ${action} per hour for this app`)
  }
}

/** One-line audit logger. Fire-and-forget at the end of every route. */
export async function audit(
  userId: string,
  appId: number,
  action: string,
  payload: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await svc().from('divigo_app_audit').insert({ user_id: userId, app_id: appId, action, payload })
  } catch { /* never fail a real request over an audit log error */ }
}

/** Hash an app secret for storage. Exported so the admin UI uses the same impl. */
export function hashAppSecret(secret: string): string {
  return sha256hex(secret)
}
