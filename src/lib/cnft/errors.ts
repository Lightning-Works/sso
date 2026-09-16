/**
 * Error taxonomy for the shared cNFT module. Adapted from crunk.fun.
 *
 * The rule that matters: the three sender codes are NEVER flattened into a generic failure.
 *   PREFLIGHT     rejected before landing. Nothing moved. Retry is safe.
 *   ONCHAIN_FAIL  landed, instruction failed. Nothing moved. Retry is safe.
 *   UNCONFIRMED   outcome genuinely unknown. It MAY have paid.
 *                 NEVER auto-retry, NEVER auto-refund. Human review.
 */

export const MINT_ERROR_CODES = [
  'PREFLIGHT',
  'ONCHAIN_FAIL',
  'UNCONFIRMED',
  'CAP_EXCEEDED',
  'DECLARATION_MISMATCH',
  'SIMULATION_FAILED',
  'INSTRUCTION_REJECTED',
  'IDEMPOTENCY_IN_FLIGHT',
  'IDEMPOTENCY_KEY_REUSED',
  'DISABLED',
  'CAP_MISCONFIGURED',
  'PROOF_NOT_READY',
  'LEAF_NOT_READY',
  'TREE_NOT_VISIBLE',
  'CAPACITY_PENDING',
  'UNRESOLVABLE_URI',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'UNAUTHORIZED',
  'TREASURY_UNREACHABLE',
  'INTERNAL',
] as const

export type MintErrorCode = (typeof MINT_ERROR_CODES)[number]

const RETRYABLE: ReadonlySet<MintErrorCode> = new Set<MintErrorCode>([
  'PREFLIGHT',
  'ONCHAIN_FAIL',
  'CAP_EXCEEDED',
  'IDEMPOTENCY_IN_FLIGHT',
  'PROOF_NOT_READY',
  'LEAF_NOT_READY',
  'TREE_NOT_VISIBLE',
  'CAPACITY_PENDING',
  'TREASURY_UNREACHABLE',
])

const NEEDS_HUMAN: ReadonlySet<MintErrorCode> = new Set<MintErrorCode>([
  'UNCONFIRMED',
  'CAP_MISCONFIGURED',
])

const HTTP_STATUS: Readonly<Record<MintErrorCode, number>> = {
  PREFLIGHT: 502,
  ONCHAIN_FAIL: 502,
  UNCONFIRMED: 504,
  CAP_EXCEEDED: 429,
  DECLARATION_MISMATCH: 422,
  SIMULATION_FAILED: 422,
  INSTRUCTION_REJECTED: 422,
  IDEMPOTENCY_IN_FLIGHT: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  DISABLED: 503,
  CAP_MISCONFIGURED: 503,
  PROOF_NOT_READY: 409,
  LEAF_NOT_READY: 409,
  TREE_NOT_VISIBLE: 409,
  CAPACITY_PENDING: 409,
  UNRESOLVABLE_URI: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  TREASURY_UNREACHABLE: 502,
  INTERNAL: 500,
}

export class MintError extends Error {
  readonly code: MintErrorCode
  readonly detail: Record<string, unknown>

  constructor(code: MintErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'MintError'
    this.code = code
    this.detail = detail
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code)
  }

  get requiresHumanReview(): boolean {
    return NEEDS_HUMAN.has(this.code)
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code]
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      requiresHumanReview: this.requiresHumanReview,
      ...this.detail,
    }
  }
}

export function isMintErrorCode(v: unknown): v is MintErrorCode {
  return typeof v === 'string' && (MINT_ERROR_CODES as readonly string[]).includes(v)
}

export function toMintError(err: unknown, fallback: MintErrorCode = 'INTERNAL'): MintError {
  if (err instanceof MintError) return err
  const message = err instanceof Error ? err.message : String(err)
  return new MintError(fallback, message)
}
