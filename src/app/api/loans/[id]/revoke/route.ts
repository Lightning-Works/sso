/**
 * POST /api/loans/[id]/revoke   — owner cancels their own loan.
 *
 * Mirror of /return but for owners. Works on pending loans (kills the
 * unclaimed link) and on active loans (force-returns; borrower loses
 * access immediately).
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
  if (l.owner_user_id !== user.id) return NextResponse.json({ error: 'Not your loan to revoke' }, { status: 403 })
  if (l.returned_at || l.revoked_at) return NextResponse.json({ ok: true })

  const { error } = await db.from('comic_loans')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
