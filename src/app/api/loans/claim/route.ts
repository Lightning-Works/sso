/**
 * POST /api/loans/claim   — borrower claims a loan via its loan_code.
 *
 * Body: { loanCode }
 *
 * Idempotent for the same user — re-claiming yields the same row. Fails
 * if the loan was already claimed by someone else, expired, or revoked
 * by the owner. A user cannot claim their own loan.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loanStatus, type LoanRow } from '@/lib/loans/types'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const loanCode = String(body.loanCode || '').trim()
  if (!loanCode) return NextResponse.json({ error: 'Missing loan code' }, { status: 400 })

  const db = svc()
  const { data: loan } = await db.from('comic_loans').select('*').eq('loan_code', loanCode).maybeSingle()
  if (!loan) return NextResponse.json({ error: 'Invalid loan link' }, { status: 404 })

  const l = loan as LoanRow
  const s = loanStatus(l)

  if (s === 'expired') return NextResponse.json({ error: 'This loan has expired' }, { status: 410 })
  if (s === 'revoked') return NextResponse.json({ error: 'This loan was cancelled by the owner' }, { status: 410 })
  if (s === 'returned') return NextResponse.json({ error: 'This loan was already returned' }, { status: 410 })
  if (l.owner_user_id === user.id) return NextResponse.json({ error: 'You can’t claim a loan you created' }, { status: 400 })
  if (l.borrower_user_id && l.borrower_user_id !== user.id) {
    return NextResponse.json({ error: 'This loan was already claimed by someone else' }, { status: 409 })
  }

  // First-time claim — set borrower + accepted_at. Idempotent for re-claims.
  if (!l.accepted_at) {
    const { error } = await db.from('comic_loans')
      .update({ borrower_user_id: user.id, accepted_at: new Date().toISOString() })
      .eq('id', l.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: l.id, contractAddress: l.contract_address, tokenId: l.token_id, expiresAt: l.expires_at })
}
