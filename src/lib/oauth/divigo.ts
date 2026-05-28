/**
 * OAuth-style auth helpers for `/api/oauth/divigo/*` routes.
 *
 * Every app→DiviGo call must satisfy ALL THREE:
 *   1. Authorization: Bearer <app_token>    per-(user, app) opaque token
 *                                           minted at consent time
 *   2. X-LW-App-Slug + X-LW-App-Secret      identifies a vetted app
 *   3. divigo_app_grants row                user consented to this app +
 *                                           scope and hasn't revoked
 *
 * Why an opaque app-token (NOT the user's Supabase JWT): the SSO and each
 * game run separate Supabase projects, so the user's session JWT on the
 * game side wouldn't authenticate against the SSO's auth.users. The app
 * token is independent of either Supabase and is unambiguously bound to
 * (user, app) on the SSO side.
 *
 * Result: stealing one credential ≠ access. Stealing all three still
 * leaves actual fund movement gated by DiviGo's Telegram approval.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
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
  user: { id: string }
  app: AppRow
  grant: { id: string; scopes: string[] }
  /** Optional idempotency key from header — propagate to downstream writes. */
  idempotencyKey: string | null
}

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

/** sha256(input) → hex. Used for both API secrets and bearer app-tokens. */
export function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Constant-time hex compare. */
function safeEqHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** Generate a new app-token. 32 bytes of base64url ≈ 43 chars; non-guessable. */
export function newAppToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Hash an app secret for storage. Exported so admin UI uses the same impl. */
export function hashAppSecret(secret: string): string {
  return sha256hex(secret)
}

/**
 * Verify the trio: app credentials, bearer app-token (with optional scope
 * requirement), and grant existence. Returns the resolved context or
 * throws OAuthError.
 *
 * `requiredScope` is the scope the calling route needs (e.g. 'balance:read').
 * For status/discovery calls that should work pre-grant, use `withApp()` below.
 */
export async function withAppAndUser(
  request: Request,
  requiredScope: DivigoScope,
): Promise<AuthedAppContext> {
  // App credentials FIRST — if these fail there's nothing else to check
  // and we never touch the token lookup, which means a 401 for invalid
  // app slugs gives no signal about whether tokens exist.
  const app = await verifyAppCredentials(request)

  // Bearer token → look up its hash in divigo_app_tokens.
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) throw new OAuthError(401, 'unauthenticated', 'Authorization: Bearer <app_token> required')
  const tokenPlain = m[1].trim()
  if (!tokenPlain) throw new OAuthError(401, 'unauthenticated')
  const tokenHash = sha256hex(tokenPlain)

  const db = svc()
  const { data: tok } = await db.from('divigo_app_tokens')
    .select('user_id, app_id').eq('token_hash', tokenHash).maybeSingle()
  // The token MUST be bound to this app — prevents a token issued for app A
  // from being replayed against app B by an attacker who also has B's secret.
  if (!tok || tok.app_id !== app.id) {
    throw new OAuthError(401, 'unauthenticated', 'App token invalid or not for this app')
  }

  // Grant + scope check.
  const { data: grant } = await db.from('divigo_app_grants')
    .select('id, scopes, revoked_at').eq('user_id', tok.user_id).eq('app_id', app.id).maybeSingle()
  if (!grant || grant.revoked_at) {
    throw new OAuthError(403, 'no_grant', 'User has not granted this app DiviGo access')
  }
  const scopes = (grant.scopes || []) as string[]
  if (!scopes.includes(requiredScope)) {
    throw new OAuthError(403, 'missing_scope', `User did not grant ${requiredScope}`)
  }

  // Touch last_used_at — useful for the connections dashboard.
  db.from('divigo_app_tokens').update({ last_used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash).then(() => {}, () => {})

  const idemRaw = request.headers.get('idempotency-key')
  const idempotencyKey = idemRaw ? idemRaw.trim().slice(0, 80) : null

  return { user: { id: tok.user_id }, app, grant: { id: grant.id, scopes }, idempotencyKey }
}

/**
 * Pre-grant variant: app+token check (no scope check, since by definition
 * the user hasn't granted any scope yet on the FIRST status call). Used by
 * /api/oauth/divigo/status as the bootstrap discovery endpoint.
 *
 * Apps don't HAVE a token before the first grant, so status accepts EITHER
 * a bound token (returns the grant state) OR app-only credentials with an
 * X-LW-User-Email header (returns "this user hasn't granted anything yet").
 */
export async function statusContext(
  request: Request,
): Promise<{ app: AppRow; user: { id: string } | null }> {
  const app = await verifyAppCredentials(request)
  // If a bearer is present, resolve to user via token.
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) {
    const tokenHash = sha256hex(m[1].trim())
    const { data: tok } = await svc().from('divigo_app_tokens')
      .select('user_id, app_id').eq('token_hash', tokenHash).maybeSingle()
    if (tok && tok.app_id === app.id) return { app, user: { id: tok.user_id } }
  }
  // No token yet → user is unknown to us. App can still call /grant by
  // redirecting the user to the consent screen.
  return { app, user: null }
}

async function verifyAppCredentials(request: Request): Promise<AppRow> {
  const slug = (request.headers.get('x-lw-app-slug') || '').trim().toLowerCase()
  const secret = (request.headers.get('x-lw-app-secret') || '').trim()
  if (!slug || !secret) {
    throw new OAuthError(401, 'app_unauthenticated', 'X-LW-App-Slug and X-LW-App-Secret are required')
  }
  const { data: app } = await svc().from('apps')
    .select('id, slug, name, divigo_enabled, api_secret_hash')
    .eq('slug', slug).maybeSingle() as { data: AppRow | null }
  if (!app) throw new OAuthError(401, 'app_unauthenticated', 'Unknown app slug')
  if (!app.api_secret_hash || !safeEqHex(app.api_secret_hash, sha256hex(secret))) {
    throw new OAuthError(401, 'app_unauthenticated', 'App secret mismatch')
  }
  if (!app.divigo_enabled) {
    throw new OAuthError(403, 'app_not_enabled', 'This app is not authorised for DiviGo wallet access')
  }
  return app
}

/**
 * Per-(user, app) rate limit using the audit-log count over a time window.
 * Throws 429 if the cap is hit.
 */
export async function rateLimit(
  userId: string,
  appId: number,
  action: string,
  maxPerHour: number,
): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await svc().from('divigo_app_audit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('app_id', appId).eq('action', action).gte('created_at', hourAgo)
  if ((count || 0) >= maxPerHour) {
    throw new OAuthError(429, 'rate_limited', `Rate limit: max ${maxPerHour} ${action} per hour for this app`)
  }
}

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

/**
 * Mint (or rotate) a per-(user, app) bearer token. Returns the plaintext —
 * this is the ONLY moment it's available. The hash is stored; the plaintext
 * is given to the app once and never reproduced.
 */
export async function mintAppToken(userId: string, appId: number): Promise<string> {
  const plaintext = newAppToken()
  const hash = sha256hex(plaintext)
  const db = svc()
  // Remove any existing token for this (user, app) first — regrant rotates.
  await db.from('divigo_app_tokens').delete().eq('user_id', userId).eq('app_id', appId)
  const { error } = await db.from('divigo_app_tokens').insert({
    token_hash: hash, user_id: userId, app_id: appId,
  })
  if (error) throw new OAuthError(500, 'token_mint_failed', error.message)
  return plaintext
}

/** Delete any token for (user, app). Called on revoke. */
export async function deleteAppToken(userId: string, appId: number): Promise<void> {
  await svc().from('divigo_app_tokens').delete().eq('user_id', userId).eq('app_id', appId)
}
