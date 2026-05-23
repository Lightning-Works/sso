/**
 * /loan/[code] — landing page for shared loan links.
 *
 * Signed in:  claim the loan (idempotent) and redirect to /wallet/lw,
 *             where the borrowed comic shows up as "Loaned to me".
 * Signed out: redirect to /login with `?next=/loan/[code]`, then the
 *             login page resumes the flow after auth (OAuth or
 *             email/password — both honour `next`).
 *
 * For unclaimable links (expired/revoked/already taken/own loan) we
 * render a small message page instead of redirecting silently, so the
 * user has context.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { loanStatus, type LoanRow } from '@/lib/loans/types'
import { resolveUserLabel } from '@/lib/loans/identifier'

export const dynamic = 'force-dynamic'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: '1rem' }}>
      <div style={{ maxWidth: 480, padding: '2rem', background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.6)', textAlign: 'center' }}>
        <h1 style={{ color: '#fff', margin: '0 0 .75rem', fontSize: '1.25rem', fontWeight: 700 }}>{title}</h1>
        <p style={{ color: '#e4dad1', margin: '0 0 1.5rem', fontSize: '.95rem', lineHeight: 1.45 }}>{body}</p>
        <Link href="/wallet/lw" style={{ display: 'inline-block', background: 'var(--lw-purple, #6a24fa)', color: '#fff', textDecoration: 'none', padding: '.55rem 1.1rem', borderRadius: 6, fontSize: '.9rem', fontWeight: 600 }}>
          Go to my wallet
        </Link>
      </div>
    </div>
  )
}

export default async function LoanLandingPage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const safeCode = String(code || '').replace(/[^A-Za-z0-9]/g, '')
  if (!safeCode || safeCode !== code) {
    return <Message title="Invalid loan link" body="This link is malformed. Ask the sender for a fresh one." />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/loan/' + safeCode)}`)
  }

  const db = svc()
  const { data: loan } = await db.from('comic_loans').select('*').eq('loan_code', safeCode).maybeSingle()
  if (!loan) {
    return <Message title="Invalid loan link" body="This loan link is unknown — it may have been mistyped, or the loan has been deleted." />
  }
  const l = loan as LoanRow
  const status = loanStatus(l)

  if (status === 'expired') return <Message title="Loan expired" body="The loan period has ended. Ask the owner to send a fresh loan if they'd like you to read it again." />
  if (status === 'revoked') return <Message title="Loan cancelled" body="The owner cancelled this loan. It's no longer available to claim." />
  if (status === 'returned') return <Message title="Loan returned" body="This loan was already returned and is no longer claimable." />

  if (l.owner_user_id === user.id) {
    return <Message title="That's your own loan" body="You created this loan — you can't claim it. Forward the link to the friend you want to lend the comic to." />
  }
  if (l.borrower_user_id && l.borrower_user_id !== user.id) {
    const otherLabel = await resolveUserLabel(db, l.borrower_user_id)
    return <Message title="Already claimed" body={`This loan was claimed by ${otherLabel}. Each loan link works for one borrower.`} />
  }

  // First-time claim. Idempotent on re-visit.
  if (!l.accepted_at) {
    await db.from('comic_loans').update({
      borrower_user_id: user.id,
      accepted_at: new Date().toISOString(),
    }).eq('id', l.id)
  }

  redirect('/wallet/lw')
}
