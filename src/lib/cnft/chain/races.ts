/**
 * The three RPC races. Adapted from crunk.fun. All three present as "you forgot a step" in
 * code you just wrote; they are timing, not bugs. Every caller must be resumable.
 *   1. A just-created tree config is not immediately visible (mintV2 -> AccountNotInitialized).
 *   2. A confirmed signature is not immediately fetchable (parse leaf throws for seconds).
 *   3. DAS indexing lags the chain by MINUTES on devnet; proof lags asset further.
 */
import { findTreeConfigPda, parseLeafFromMintV2Transaction } from '@metaplex-foundation/mpl-bubblegum'
import type { PublicKey, Umi } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import { MintError } from '../errors'

export interface PollOptions {
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  onWait?: (attempt: number) => void
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** RACE 1 - wait for a freshly created tree's config PDA to become visible. */
export async function waitForTreeConfig(
  umi: Umi,
  merkleTree: PublicKey,
  opts: PollOptions = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const intervalMs = opts.intervalMs ?? 1_000
  const sleep = opts.sleep ?? defaultSleep

  const treeConfig = findTreeConfigPda(umi, { merkleTree })[0]
  const started = Date.now()
  let attempt = 0

  for (;;) {
    attempt += 1
    if ((await umi.rpc.getAccount(treeConfig)).exists) return
    if (Date.now() - started >= timeoutMs) {
      throw new MintError(
        'TREE_NOT_VISIBLE',
        `Tree config ${treeConfig} for tree ${merkleTree} was still not visible after ` +
          `${Math.round((Date.now() - started) / 1000)}s. The tree almost certainly exists - ` +
          `this is RPC propagation lag. Retry; do NOT create another tree.`,
        { merkleTree, treeConfig, attempts: attempt }
      )
    }
    opts.onWait?.(attempt)
    await sleep(intervalMs)
  }
}

export interface ParsedLeaf {
  nonce: bigint
}

/** RACE 2 - parse the minted leaf out of a just-confirmed transaction. */
export async function parseLeafWithRetry(
  umi: Umi,
  signature: string,
  opts: PollOptions = {}
): Promise<ParsedLeaf> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  const intervalMs = opts.intervalMs ?? 1_500
  const sleep = opts.sleep ?? defaultSleep

  const sigBytes = base58.serialize(signature)
  const started = Date.now()
  let attempt = 0
  let lastError = ''

  for (;;) {
    attempt += 1
    try {
      const leaf = await parseLeafFromMintV2Transaction(umi, sigBytes)
      return { nonce: leaf.nonce }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    if (Date.now() - started >= timeoutMs) {
      throw new MintError(
        'LEAF_NOT_READY',
        `Mint transaction ${signature} is confirmed but still not fetchable after ` +
          `${Math.round((Date.now() - started) / 1000)}s. The MINT SUCCEEDED - do not re-mint. ` +
          `Resume later. Last error: ${lastError}`,
        { signature, attempts: attempt }
      )
    }
    opts.onWait?.(attempt)
    await sleep(intervalMs)
  }
}

/** RACE 3 wrapper - turn a DAS poll timeout into the typed, retryable PROOF_NOT_READY. */
export function proofNotReady(assetId: string, cause: unknown): MintError {
  return new MintError(
    'PROOF_NOT_READY',
    `DAS has not indexed asset ${assetId} and its proof yet. On devnet this lags the chain ` +
      `by MINUTES. This is not a failure - retry later. Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
    { assetId }
  )
}
