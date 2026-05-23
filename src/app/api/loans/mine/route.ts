/**
 * GET /api/loans/mine   — outgoing + incoming loans for the signed-in user.
 *
 * Outgoing: every "live" loan (pending OR active) where the user is owner.
 *           Used to grey out and label "Loaned to X" cards in their wallet,
 *           and to back the Revoke action.
 * Incoming: every "active" loan where the user is borrower. Hydrated with
 *           the NFT's display metadata (name, image, animationUrl, attrs)
 *           so the wallet can render the borrowed comic as a normal card.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isLoanActive, isLoanLive, loanStatus, type LoanRow } from '@/lib/loans/types'
import { resolveUserLabel } from '@/lib/loans/identifier'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface OutgoingLoan {
  id: string
  contractAddress: string
  tokenId: string
  status: 'pending' | 'active'
  expiresAt: string
  borrowerLabel: string
}

interface IncomingLoan {
  id: string
  contractAddress: string
  tokenId: string
  status: 'active'
  expiresAt: string
  ownerLabel: string
  // NFT display metadata
  nftName: string
  imageUrl: string | null
  animationUrl: string | null
  attributes: { key: string; value: string }[]
  collection: string
  chain: string
  rarity: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ outgoing: [], incoming: [] })

  const db = svc()

  // Fetch both sides in parallel
  const [outRes, inRes] = await Promise.all([
    db.from('comic_loans').select('*').eq('owner_user_id', user.id),
    db.from('comic_loans').select('*').eq('borrower_user_id', user.id),
  ])

  const liveOut = ((outRes.data || []) as LoanRow[]).filter(l => isLoanLive(l))
  const activeIn = ((inRes.data || []) as LoanRow[]).filter(l => isLoanActive(l))

  // Resolve borrower labels for outgoing loans (one DB hit per distinct
  // borrower). Pending loans without a borrower fall back to the invitee
  // label (the email/phone the owner typed when creating the loan) or
  // a generic "via shareable link".
  const outgoing: OutgoingLoan[] = await Promise.all(liveOut.map(async l => ({
    id: l.id,
    contractAddress: l.contract_address,
    tokenId: l.token_id,
    status: loanStatus(l) as 'pending' | 'active',
    expiresAt: l.expires_at,
    borrowerLabel: l.borrower_user_id
      ? await resolveUserLabel(db, l.borrower_user_id)
      : (l.invitee_label || 'via shareable link'),
  })))

  // For incoming, also fetch the NFT row + contract row so the wallet can
  // render a card without having to import the NFT.
  const incoming: IncomingLoan[] = []
  if (activeIn.length) {
    // Group by contract for one round-trip
    const contractAddrs = [...new Set(activeIn.map(l => l.contract_address.toLowerCase()))]
    const { data: contracts } = await db.from('lw_nft_contracts')
      .select('id, chain, contract_address, collection_name')
      .in('contract_address', contractAddrs)
    const ctById = new Map((contracts || []).map(c => [c.id, c]))
    const ctByAddr = new Map((contracts || []).map(c => [String(c.contract_address).toLowerCase(), c]))

    const tokenFilters = activeIn
      .map(l => ({ contract_id: ctByAddr.get(l.contract_address.toLowerCase())?.id, token_id: l.token_id }))
      .filter((t): t is { contract_id: number; token_id: string } => !!t.contract_id)

    type NftRow = { contract_id: number; token_id: string; name: string; image_url: string | null; animation_url: string | null; attributes: { trait_type?: string; value?: unknown }[] }
    const nftByKey = new Map<string, NftRow>()
    if (tokenFilters.length) {
      // OR-of-(contract_id,token_id) — Supabase doesn't have a native compound IN, so query per contract.
      for (const cid of new Set(tokenFilters.map(t => t.contract_id))) {
        const tokens = tokenFilters.filter(t => t.contract_id === cid).map(t => t.token_id)
        const { data: rows } = await db.from('lw_nft_data')
          .select('contract_id, token_id, name, image_url, animation_url, attributes')
          .eq('contract_id', cid).in('token_id', tokens)
        for (const r of (rows || []) as NftRow[]) nftByKey.set(`${r.contract_id}:${r.token_id}`, r)
      }
    }

    for (const l of activeIn) {
      const ct = ctByAddr.get(l.contract_address.toLowerCase())
      const nft = ct ? nftByKey.get(`${ct.id}:${l.token_id}`) : undefined
      const tierAttr = (nft?.attributes || []).find(a => {
        const k = String(a.trait_type || '').toLowerCase()
        return k === 'tier' || k === 'rarity'
      })
      incoming.push({
        id: l.id,
        contractAddress: l.contract_address,
        tokenId: l.token_id,
        status: 'active',
        expiresAt: l.expires_at,
        ownerLabel: await resolveUserLabel(db, l.owner_user_id),
        nftName: nft?.name || `Mint #${l.token_id}`,
        imageUrl: nft?.image_url || null,
        animationUrl: nft?.animation_url || null,
        attributes: (nft?.attributes || [])
          .filter(a => a.trait_type)
          .map(a => ({ key: a.trait_type!, value: String(a.value || '') })),
        collection: ct?.collection_name || '',
        chain: ct?.chain || '',
        rarity: tierAttr ? String(tierAttr.value || '') : null,
      })
      // Silence the "unused" diagnostic for ctById in case Postgres view changes:
      void ctById
    }
  }

  return NextResponse.json({ outgoing, incoming })
}
