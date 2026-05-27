/**
 * GET /api/oauth/divigo/status
 *
 * For an app-backend asking on behalf of a signed-in user: does the user
 * have DiviGo linked, and which scopes did they grant THIS app?
 *
 * Unlike the other oauth routes this doesn't require a scope — it's the
 * discovery call apps make BEFORE they know whether they have permission.
 * But it still needs valid user+app credentials to prevent enumeration.
 *
 * Response:
 *   { linked: boolean, scopes: string[] }
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { OAuthError } from '@/lib/oauth/divigo'
import { createHash, timingSafeEqual } from 'crypto'
import { createClient as createPublicClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function sha256hex(s: string) { return createHash('sha256').update(s).digest('hex') }
function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export async function GET(request: Request) {
  try {
    // Inline a lighter auth than withAppAndUser — status doesn't need a grant
    // to exist (callers use this to check IF a grant exists), so we can't
    // reuse the helper. But user+app must still be valid.
    const auth = request.headers.get('authorization') || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (!m) throw new OAuthError(401, 'unauthenticated')
    const sb = createPublicClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${m[1].trim()}` } } },
    )
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new OAuthError(401, 'unauthenticated')

    const slug = (request.headers.get('x-lw-app-slug') || '').trim().toLowerCase()
    const secret = (request.headers.get('x-lw-app-secret') || '').trim()
    if (!slug || !secret) throw new OAuthError(401, 'app_unauthenticated')

    const db = svc()
    const { data: app } = await db.from('apps')
      .select('id, divigo_enabled, api_secret_hash').eq('slug', slug).maybeSingle()
    if (!app || !app.api_secret_hash || !safeEqHex(app.api_secret_hash, sha256hex(secret))) {
      throw new OAuthError(401, 'app_unauthenticated')
    }
    if (!app.divigo_enabled) throw new OAuthError(403, 'app_not_enabled')

    const { data: link } = await db.from('divigo_links')
      .select('verified_at').eq('user_id', user.id).maybeSingle()
    const linked = !!link?.verified_at

    const { data: grant } = await db.from('divigo_app_grants')
      .select('scopes, revoked_at').eq('user_id', user.id).eq('app_id', app.id).maybeSingle()
    const scopes = grant && !grant.revoked_at ? (grant.scopes as string[]) : []

    return NextResponse.json({ linked, scopes })
  } catch (e) {
    if (e instanceof OAuthError) return e.toResponse()
    return NextResponse.json({ error: 'internal', message: String(e) }, { status: 500 })
  }
}
