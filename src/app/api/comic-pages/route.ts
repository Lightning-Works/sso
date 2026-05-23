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
import { isLoanActive, type LoanRow } from '@/lib/loans/types'
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

  // Access check. Allowed if any of:
  //   (a) admin,
  //   (b) the signed-in user owns at least one NFT of a contract that
  //       backs this comic (via connected_wallets ↔ lw_nft_data.owner),
  //   (c) the signed-in user has an active borrowed loan for any NFT of
  //       one of those contracts.
  //
  // We resolve the contracts behind the comic first, so synthetic `lw…`
  // cids (derived from a contract address) and real IPFS cids (matched
  // by animation_url substring) both work without separate code paths.
  let owns = !!admin
  if (!owns && user) {
    // Map of contract_id ↔ lowercased contract_address — both directions
    // are needed: id for joining lw_nft_data, address for joining loans.
    const idToAddr = new Map<number, string>()
    if (cid.startsWith('lw')) {
      const addr = '0x' + cid.slice(2)
      if (/^0x[0-9a-f]{4,}$/.test(addr)) {
        const { data: ct } = await db.from('lw_nft_contracts')
          .select('id, contract_address').ilike('contract_address', addr).limit(1).maybeSingle()
        if (ct) idToAddr.set(ct.id, String(ct.contract_address).toLowerCase())
      }
    } else {
      // Real IPFS cid — every contract whose minted NFTs reference it.
      const { data: toks } = await db.from('lw_nft_data')
        .select('contract_id').ilike('animation_url', `%${cid}%`).limit(5000)
      const ids = [...new Set((toks || []).map(t => t.contract_id))]
      if (ids.length) {
        const { data: cts } = await db.from('lw_nft_contracts')
          .select('id, contract_address').in('id', ids)
        for (const c of cts || []) idToAddr.set(c.id, String(c.contract_address).toLowerCase())
      }
    }
    const contractIds = [...idToAddr.keys()]
    const contractAddresses = [...idToAddr.values()]

    // (b) Any OWNED mint of any of these contracts that ISN'T currently
    //     lent out — locked-out mints don't grant access, per the spec.
    if (contractIds.length) {
      const { data: wallets } = await db.from('connected_wallets')
        .select('wallet_address').eq('user_id', user.id)
      const mine = new Set((wallets || []).map(w => String(w.wallet_address).toLowerCase()))
      if (mine.size) {
        // Active outgoing loans this user has on any of these contracts
        // — those mints are locked out for them while the loan is active.
        const lockedOut = new Set<string>()
        const { data: outLoans } = await db.from('comic_loans').select('*')
          .eq('owner_user_id', user.id).in('contract_address', contractAddresses)
        for (const l of (outLoans || []) as LoanRow[]) {
          if (isLoanActive(l)) lockedOut.add(`${l.contract_address.toLowerCase()}:${l.token_id}`)
        }
        const { data: mints } = await db.from('lw_nft_data')
          .select('contract_id, token_id, owner').in('contract_id', contractIds).limit(20000)
        owns = (mints || []).some(m => {
          if (!m.owner || !mine.has(String(m.owner).toLowerCase())) return false
          const addr = idToAddr.get(m.contract_id)
          if (!addr) return true
          return !lockedOut.has(`${addr}:${m.token_id}`)
        })
      }
    }

    // (c) active borrowed loan for any of these contracts
    if (!owns && contractAddresses.length) {
      const { data: borrows } = await db.from('comic_loans')
        .select('*').eq('borrower_user_id', user.id).in('contract_address', contractAddresses)
      owns = (borrows || []).some(l => isLoanActive(l as LoanRow))
    }
  }
  if (!owns) return NextResponse.json({ error: 'You must own this NFT to read it' }, { status: 403 })

  const bucket = db.storage.from('comic_pages')
  const pages = await Promise.all(
    (comic.pages as { label?: string; file?: string; ar?: Record<string, string>; tier?: string; section?: string }[]).map(async (p, i) => {
      const file = String(p.file || '').replace(/[^A-Za-z0-9._-]/g, '')
      const label = String(p.label || (i + 1))
      const tier = (p.tier && String(p.tier).trim()) || null
      const section = (p.section && String(p.section).trim()) || null
      let url: string | null = null
      if (file) {
        const { data } = await bucket.createSignedUrl(`${cid}/${file}`, 3600)
        url = data?.signedUrl ?? null
      }
      // Permanent Arweave copy (double fallback): prefer 'full', else any.
      const arMap = p.ar || {}
      const arId = arMap.full || arMap.highres || Object.values(arMap)[0] || null
      const ar = arId ? arweaveUrl(arId) : null
      return { label, file, url, ar, tier, section }
    }),
  )

  // format: 'pages' (book-style reader) or 'webtoon' (vertical scroll).
  // comic.format is absent until the optional column is added — default
  // to 'pages' so existing comics keep working with no migration.
  const format = (comic as { format?: string }).format === 'webtoon' ? 'webtoon' : 'pages'
  return NextResponse.json({ name: comic.name, pages, isAdmin: !!admin, format })
}
