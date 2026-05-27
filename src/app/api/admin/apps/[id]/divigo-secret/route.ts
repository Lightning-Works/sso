/**
 * POST /api/admin/apps/[id]/divigo-secret   — generate / rotate API secret.
 *
 * Admin-only. Generates a fresh 32-byte URL-safe secret, stores its
 * SHA-256 hex hash on apps.api_secret_hash, and returns the plaintext
 * ONCE in the response body. The admin UI shows it in a copy modal —
 * if the admin loses it, they must rotate again (the old one is gone).
 *
 * Rotating immediately invalidates the previous secret. Any app backend
 * still using the old value will start getting 401 app_unauthenticated
 * until the admin distributes the new one.
 */
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { hashAppSecret } from '@/lib/oauth/divigo'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id, 10)
  if (!Number.isFinite(appId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })

  // 32 bytes → 43-char base64url. Plenty of entropy; URL-safe so admins
  // can paste it cleanly into env files.
  const secret = randomBytes(32).toString('base64url')
  const hash = hashAppSecret(secret)

  const { error } = await svc().from('apps').update({ api_secret_hash: hash }).eq('id', appId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    secret,
    notice: 'Copy this now — it cannot be recovered. Rotate again to invalidate.',
  })
}
