/**
 * Comic-loan shared types and status derivation.
 *
 * A loan is a single row in `comic_loans` whose status is computed from
 * its timestamps — no separate status column, so a loan can never get
 * into an inconsistent state.
 */

export interface LoanRow {
  id: string
  loan_code: string
  contract_address: string
  token_id: string
  owner_user_id: string
  borrower_user_id: string | null
  invitee_label: string | null
  created_at: string
  accepted_at: string | null
  expires_at: string
  returned_at: string | null
  revoked_at: string | null
}

export type LoanStatus = 'pending' | 'active' | 'returned' | 'revoked' | 'expired'

export function loanStatus(l: LoanRow, now: number = Date.now()): LoanStatus {
  if (l.revoked_at) return 'revoked'
  if (l.returned_at) return 'returned'
  if (Date.parse(l.expires_at) <= now) return 'expired'
  if (l.accepted_at) return 'active'
  return 'pending'
}

/** A loan that's actively locking out the owner (and grants the borrower
 *  read access). */
export function isLoanActive(l: LoanRow, now: number = Date.now()): boolean {
  return loanStatus(l, now) === 'active'
}

/** A loan that's reserved but not yet locking the owner out. */
export function isLoanPending(l: LoanRow, now: number = Date.now()): boolean {
  return loanStatus(l, now) === 'pending'
}

/** Loans that still affect ownership (block transfer / re-loan): pending or active. */
export function isLoanLive(l: LoanRow, now: number = Date.now()): boolean {
  const s = loanStatus(l, now)
  return s === 'pending' || s === 'active'
}
