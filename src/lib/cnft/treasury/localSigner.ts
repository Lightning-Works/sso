/**
 * DEVNET-ONLY in-process signer. Adapted from crunk.fun.
 *
 * This is NOT how production signs: production uses an isolated signer service that is the
 * only thing holding a key (see httpClient.ts). This shim implements the SAME TreasurySigner
 * interface and raises the SAME error codes, so the code path through the module is identical;
 * only the transport differs. It is hard-refused unless SOLANA_NETWORK=devnet (enforced by
 * the caller / config) and uses a throwaway, gitignored devnet keypair.
 *
 * It deliberately does NOT reimplement spend caps, the declared-vs-simulated cost check, the
 * program allowlist, or the audit ledger - those live only in the real signer service.
 */
import { readFileSync } from 'node:fs'
import {
  createSignerFromKeypair,
  keypairIdentity,
  type KeypairSigner,
  type Umi,
} from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import { MintError } from '../errors'
import type { SignRequest, SignResult, TreasurySigner } from './types'

export class LocalDevSigner implements TreasurySigner {
  private readonly umi: Umi
  private readonly payer: KeypairSigner
  /** In-memory only: a restart forgets keys, so a retry after a crash CAN sign twice here. */
  private readonly seen = new Map<string, SignResult>()
  private readonly inFlight = new Set<string>()

  constructor(umi: Umi, keypairPath: string) {
    const secret = new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[])
    if (secret.length !== 64) {
      throw new Error(`${keypairPath} is not a 64-byte Solana secret key array`)
    }
    this.payer = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(secret))
    umi.use(keypairIdentity(this.payer))
    this.umi = umi
  }

  async pubkey(): Promise<string> {
    return this.payer.publicKey
  }

  signMint(req: SignRequest): Promise<SignResult> {
    return this.send(req)
  }

  signBurn(req: SignRequest): Promise<SignResult> {
    return this.send(req)
  }

  signOpenTreeDepth(req: SignRequest): Promise<SignResult> {
    return this.send(req)
  }

  /**
   * additionalSigners is intentionally ignored: it exists only because the HTTP wire format
   * drops the signers umi attached. In-process the builder still carries the new account's
   * KeypairSigner, so umi already signs with it.
   */
  private async send(req: SignRequest): Promise<SignResult> {
    const prior = this.seen.get(req.idempotencyKey)
    if (prior) return { ...prior, replayed: true }

    if (this.inFlight.has(req.idempotencyKey)) {
      throw new MintError(
        'IDEMPOTENCY_IN_FLIGHT',
        `A call with idempotency key '${req.idempotencyKey}' is still running. ` +
          'Back off and retry with the SAME key.'
      )
    }
    this.inFlight.add(req.idempotencyKey)

    try {
      const res = await req.builder
        .setFeePayer(this.payer)
        .sendAndConfirm(this.umi, { confirm: { commitment: 'confirmed' } })

      const signature = base58.deserialize(res.signature)[0]

      if (res.result.value.err) {
        throw new MintError(
          'ONCHAIN_FAIL',
          `Transaction landed but the instruction failed: ${JSON.stringify(res.result.value.err)}`,
          { signature, attemptedSignatures: [signature] }
        )
      }

      const out: SignResult = {
        signature,
        attempts: 1,
        attemptedSignatures: [signature],
        ledgerId: null,
        treasuryPubkey: this.payer.publicKey,
        simulatedUsd: null,
        chargedUsd: null,
        replayed: false,
      }
      this.seen.set(req.idempotencyKey, out)
      return out
    } catch (err) {
      throw err instanceof MintError ? err : classifySendFailure(err)
    } finally {
      this.inFlight.delete(req.idempotencyKey)
    }
  }
}

/** Map a raw send failure onto the three codes that mean three different recoveries. */
export function classifySendFailure(err: unknown): MintError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('was not confirmed') ||
    lower.includes('block height exceeded')
  ) {
    return new MintError(
      'UNCONFIRMED',
      'Transaction was submitted but not confirmed. The outcome is UNKNOWN and it may have ' +
        `succeeded - do not retry, do not refund, route to a human. ${message}`
    )
  }

  if (
    lower.includes('simulation failed') ||
    lower.includes('blockhash not found') ||
    lower.includes('preflight')
  ) {
    return new MintError('PREFLIGHT', `Rejected before landing; nothing moved. ${message}`)
  }

  if (lower.includes('custom program error') || lower.includes('anchorerror')) {
    return new MintError('ONCHAIN_FAIL', `Instruction failed on chain; nothing moved. ${message}`)
  }

  return new MintError('INTERNAL', message)
}
