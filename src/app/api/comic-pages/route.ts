/**
 * GET /api/comic-pages?cid=<bundleCid>
 *
 * Returns the comic's page list with SHORT-LIVED SIGNED URLs for the
 * private fallback webp images — only if the logged-in user OWNS an NFT
 * of this comic (or is an admin, for QA/curation). The bucket is private;
 * images are never public.
 *
 *   401 not signed in · 403 not an owner · 404 no fallback configured
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/verifyAdmin'
import { arweaveUrl } from '@/lib/arweave'
import { migrateLegacyComic } from '@/lib/comics/migrate'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const cid = (params.get('cid') || '').trim()
  // Name hint lets the server find data under older name-derived cids and
  // migrate it forward (see migrateLegacyComic).
  const nameHint = (params.get('name') || '').trim() || null
  if (!/^[A-Za-z0-9]+$/.test(cid)) {
    return NextResponse.json({ error: 'Bad cid' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = await verifyAdmin(request)
  if (!user && !admin) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const db = svc()

  // The comic + its curated page list/labels. If no row exists under the
  // (contract-address) cid, look up older name-derived rows and migrate
  // them forward to this cid.
  const comic = await migrateLegacyComic(db, cid, nameHint)
  if (!comic || !Array.isArray(comic.pages) || comic.pages.length === 0) {
    return NextResponse.json({ error: 'No fallback configured for this comic' }, { status: 404 })
  }

  // Ownership: any of the user's connected wallets is the on-chain owner
  // of a token whose animation_url points at this bundle CID.
  let owns = !!admin
  if (!owns && user) {
    const { data: wallets } = await db
      .from('connected_wallets').select('wallet_address').eq('user_id', user.id)
    const mine = new Set((wallets || []).map(w => String(w.wallet_address).toLowerCase()))
    if (mine.size) {
      const { data: toks } = await db
        .from('lw_nft_data').select('owner').ilike('animation_url', `%${cid}%`).limit(5000)
      owns = (toks || []).some(t => t.owner && mine.has(String(t.owner).toLowerCase()))
    }
  }
  if (!owns) return NextResponse.json({ error: 'You must own this NFT to read it' }, { status: 403 })

  const bucket = db.storage.from('comic_pages')
  const pages = await Promise.all(
    (comic.pages as { label?: string; file?: string; ar?: Record<string, string> }[]).map(async (p, i) => {
      const file = String(p.file || '').replace(/[^A-Za-z0-9._-]/g, '')
      const label = String(p.label || (i + 1))
      let url: string | null = null
      if (file) {
        const { data } = await bucket.createSignedUrl(`${cid}/${file}`, 3600)
        url = data?.signedUrl ?? null
      }
      // Permanent Arweave copy (double fallback): prefer 'full', else any.
      const arMap = p.ar || {}
      const arId = arMap.full || arMap.highres || Object.values(arMap)[0] || null
      const ar = arId ? arweaveUrl(arId) : null
      return { label, file, url, ar }
    }),
  )

  return NextResponse.json({ name: comic.name, pages, isAdmin: !!admin })
}
