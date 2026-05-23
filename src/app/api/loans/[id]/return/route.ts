/**
 * POST /api/loans/[id]/return   — borrower returns the comic early.
 *
 * Owner regains access immediately. Only the borrower can call this;
 * owners use /revoke (which is the same effect, different name in the UI).
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { type LoanRow } from '@/lib/loans/types'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const db = svc()
  const { data: loan } = await db.from('comic_loans').select('*').eq('id', id).maybeSingle()
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
  const l = loan as LoanRow
  if (l.borrower_user_id !== user.id) return NextResponse.json({ error: 'Not your loan to return' }, { status: 403 })
  if (l.returned_at || l.revoked_at) return NextResponse.json({ ok: true })  // idempotent

  const { error } = await db.from('comic_loans')
    .update({ returned_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
