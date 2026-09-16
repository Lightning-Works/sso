/**
 * The treasury-signer contract, as the cNFT module consumes it. Adapted from crunk.fun.
 *
 * The module holds NO private key. Everything on-chain goes through this interface. The
 * production implementation is an isolated signer service (see httpClient.ts); a devnet
 * in-process shim (localSigner.ts) implements the SAME interface for testing.
 */
import type { KeypairSigner, TransactionBuilder } from '@metaplex-foundation/umi'

/** The endpoints the module uses. Each has its own program allowlist and cap category. */
export type SignEndpoint = 'mint' | 'burn' | 'open-tree-depth'

export interface SignRequest {
  /** Deterministic per unit of work (never random per attempt); protects against double-pay. */
  idempotencyKey: string
  /** What the module believes this costs, as a decimal STRING (a JSON number is a 400). */
  declaredUsd: string
  /** The umi builder. Converted to wire format only by the HTTP transport. */
  builder: TransactionBuilder
  /**
   * Accepted ONLY on open-tree-depth, for accounts created in that same transaction (a new
   * Merkle tree or collection account must sign its own creation). Discarded after landing;
   * the account's authority becomes the treasury.
   */
  additionalSigners?: KeypairSigner[]
  purpose?: string
  capCategory?: 'mint' | 'tree_creation' | 'gpu' | 'all'
}

export interface SignResult {
  signature: string
  attempts: number
  attemptedSignatures: string[]
  ledgerId: string | null
  treasuryPubkey: string
  simulatedUsd: string | null
  chargedUsd: string | null
  replayed: boolean
}

export interface TreasurySigner {
  /** The treasury address: fee payer, tree authority AND collection authority. */
  pubkey(): Promise<string>
  signMint(req: SignRequest): Promise<SignResult>
  /** Only for assets the TREASURY owns. A user forge burn is signed in the user's wallet. */
  signBurn(req: SignRequest): Promise<SignResult>
  signOpenTreeDepth(req: SignRequest): Promise<SignResult>
}

export interface WireAccountMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

export interface WireInstruction {
  programId: string
  keys: WireAccountMeta[]
  /** base64. */
  data: string
}
