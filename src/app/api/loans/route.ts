/**
 * POST /api/loans   — owner creates a loan for one of their NFTs.
 *
 * Body: { contractAddress, tokenId, days, inviteeLabel? }
 * Returns: { loanCode, url, expiresAt }
 *
 * Validates that the signed-in user is the on-chain owner of the NFT
 * (joins lw_nft_data + connected_wallets) and that the NFT doesn't
 * already have a live (pending or active) loan. Loan duration starts
 * NOW — per spec, the clock ticks even before the borrower claims.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { userOwnsNft, newLoanCode } from '@/lib/loans/ownership'
import { isLoanLive, type LoanRow } from '@/lib/loans/types'

const MAX_DAYS = 90

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const contractAddress = String(body.contractAddress || '').trim().toLowerCase()
  const tokenId = String(body.tokenId || '').trim()
  const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(body.days) || 7)))
  const inviteeLabel = body.inviteeLabel ? String(body.inviteeLabel).trim().slice(0, 200) : null

  if (!/^0x[0-9a-f]{4,}$/.test(contractAddress) || !tokenId) {
    return NextResponse.json({ error: 'Bad contract or token' }, { status: 400 })
  }

  const db = svc()
  if (!(await userOwnsNft(db, user.id, contractAddress, tokenId))) {
    return NextResponse.json({ error: 'You don’t own this NFT' }, { status: 403 })
  }

  // Block if a live (pending or active) loan already exists for this mint.
  const { data: existing } = await db.from('comic_loans')
    .select('*').eq('contract_address', contractAddress).eq('token_id', tokenId)
  if ((existing || []).some(r => isLoanLive(r as LoanRow))) {
    return NextResponse.json({ error: 'This NFT already has an outstanding loan' }, { status: 409 })
  }

  const loanCode = newLoanCode()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { data: row, error } = await db.from('comic_loans').insert({
    loan_code: loanCode,
    contract_address: contractAddress,
    token_id: tokenId,
    owner_user_id: user.id,
    invitee_label: inviteeLabel,
    expires_at: expiresAt,
  }).select().single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })

  // Build the loan URL from the request origin so it works in any env.
  const origin = new URL(request.url).origin
  const url = `${origin}/loan/${loanCode}`

  return NextResponse.json({ loanCode, url, expiresAt: row.expires_at })
}
