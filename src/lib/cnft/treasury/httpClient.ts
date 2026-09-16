/**
 * HTTP client for the isolated treasury-signer service. Adapted from crunk.fun.
 *
 * The rule this file enforces: the signer's error codes are propagated, never flattened.
 * UNCONFIRMED in particular must survive the trip - it means the outcome is unknown, it may
 * have paid, and a caller that sees a generic "failed" will retry and pay twice.
 *
 * NOTE: the standalone signer service is a later hardening step (crunk designed the contract
 * but runs devnet proofs with LocalDevSigner). This client is ready for when it exists.
 */
import { MintError, isMintErrorCode } from '../errors'
import { builderToWire, ephemeralSecretToBase58 } from './wire'
import type { SignEndpoint, SignRequest, SignResult, TreasurySigner } from './types'

export interface TreasuryClientConfig {
  treasuryUrl: string
  treasuryToken: string
}

interface TreasuryOkBody {
  ok: true
  signature: string
  attempts?: number
  attemptedSignatures?: string[]
  ledgerId?: string
  treasuryPubkey?: string
  simulatedUsd?: string
  chargedUsd?: string
  replayed?: boolean
}

interface TreasuryErrBody {
  ok: false
  error?: {
    code?: string
    message?: string
    signature?: string
    attemptedSignatures?: string[]
    ledgerId?: string
    logs?: string[]
  }
  requestId?: string
}

export class TreasuryHttpClient implements TreasurySigner {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number
  private cachedPubkey: string | null = null

  constructor(config: TreasuryClientConfig, timeoutMs = 120_000) {
    this.baseUrl = config.treasuryUrl
    this.token = config.treasuryToken
    this.timeoutMs = timeoutMs
  }

  async pubkey(): Promise<string> {
    if (this.cachedPubkey) return this.cachedPubkey
    const body = await this.request<{ pubkey?: string; publicKey?: string; address?: string }>(
      'GET',
      '/internal/treasury/pubkey'
    )
    const pk = body.pubkey ?? body.publicKey ?? body.address
    if (!pk) {
      throw new MintError(
        'TREASURY_UNREACHABLE',
        'GET /internal/treasury/pubkey returned no recognisable address field ' +
          `(saw: ${Object.keys(body).join(', ') || 'nothing'})`
      )
    }
    this.cachedPubkey = pk
    return pk
  }

  signMint(req: SignRequest): Promise<SignResult> {
    return this.sign('mint', req)
  }

  signBurn(req: SignRequest): Promise<SignResult> {
    return this.sign('burn', req)
  }

  signOpenTreeDepth(req: SignRequest): Promise<SignResult> {
    return this.sign('open-tree-depth', req)
  }

  private async sign(endpoint: SignEndpoint, req: SignRequest): Promise<SignResult> {
    if (endpoint !== 'open-tree-depth' && req.additionalSigners?.length) {
      throw new MintError(
        'VALIDATION',
        `additionalSigners is accepted only on open-tree-depth, not on '${endpoint}'`
      )
    }

    const payload: Record<string, unknown> = {
      idempotencyKey: req.idempotencyKey,
      declaredUsd: req.declaredUsd,
      instructions: builderToWire(req.builder),
    }
    if (req.additionalSigners?.length) {
      payload['additionalSigners'] = req.additionalSigners.map(ephemeralSecretToBase58)
    }
    if (req.purpose) payload['purpose'] = req.purpose
    if (req.capCategory) payload['capCategory'] = req.capCategory

    const body = await this.request<TreasuryOkBody>('POST', `/internal/sign/${endpoint}`, payload)

    if (this.cachedPubkey === null && body.treasuryPubkey) {
      this.cachedPubkey = body.treasuryPubkey
    }

    return {
      signature: body.signature,
      attempts: body.attempts ?? 1,
      attemptedSignatures: body.attemptedSignatures ?? (body.signature ? [body.signature] : []),
      ledgerId: body.ledgerId ?? null,
      treasuryPubkey: body.treasuryPubkey ?? this.cachedPubkey ?? '',
      simulatedUsd: body.simulatedUsd ?? null,
      chargedUsd: body.chargedUsd ?? null,
      replayed: body.replayed === true,
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      throw new MintError(
        'TREASURY_UNREACHABLE',
        `${method} ${path} failed to reach treasury-signer: ` +
          (err instanceof Error ? err.message : String(err))
      )
    }

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      throw new MintError(
        'TREASURY_UNREACHABLE',
        `${method} ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      )
    }

    if (res.ok && (parsed as { ok?: boolean }).ok !== false) {
      return parsed as T
    }

    const errBody = parsed as TreasuryErrBody
    const rawCode = errBody.error?.code
    const code = isMintErrorCode(rawCode) ? rawCode : 'INTERNAL'
    throw new MintError(
      code,
      errBody.error?.message ?? `treasury-signer ${method} ${path} failed (HTTP ${res.status})`,
      {
        treasuryCode: rawCode ?? null,
        httpStatus: res.status,
        ...(errBody.error?.signature ? { signature: errBody.error.signature } : {}),
        ...(errBody.error?.attemptedSignatures
          ? { attemptedSignatures: errBody.error.attemptedSignatures }
          : {}),
        ...(errBody.error?.ledgerId ? { ledgerId: errBody.error.ledgerId } : {}),
        ...(errBody.error?.logs ? { logs: errBody.error.logs.slice(-20) } : {}),
        ...(errBody.requestId ? { treasuryRequestId: errBody.requestId } : {}),
      }
    )
  }
}
