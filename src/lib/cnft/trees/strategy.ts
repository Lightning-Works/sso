/**
 * Tree strategy. Adapted from crunk.fun (which measured real devnet rent to the lamport).
 *
 * Two physical trees per collection: a depth-5 starter (32 slots, ~$1.18) then a single jump
 * to depth-14 (16,384 slots, ~$19.40). The user-facing 32 -> 64 -> 128 progression is a game
 * mechanic enforced in the DATABASE by the consuming app, NOT a chain constraint - collection
 * membership comes from the MPL Core collection, not the tree.
 *
 * ALWAYS INCLUDE THE CANOPY (rule: maxDepth - canopyDepth <= 10) so trees stay composable
 * with Magic Eden / Tensor. At these depths the canopy is only a 1-3% rent premium.
 */
import { getMerkleTreeSize } from '@metaplex-foundation/mpl-account-compression'
import type { Umi } from '@metaplex-foundation/umi'

export interface TreeSpec {
  maxDepth: number
  maxBufferSize: number
  canopyDepth: number
  capacity: number
}

export const TREE_PLAN: readonly TreeSpec[] = Object.freeze([
  { maxDepth: 5, maxBufferSize: 8, canopyDepth: 0, capacity: 32 },
  { maxDepth: 14, maxBufferSize: 64, canopyDepth: 4, capacity: 16_384 },
])

export function isComposable(spec: Pick<TreeSpec, 'maxDepth' | 'canopyDepth'>): boolean {
  return spec.maxDepth - spec.canopyDepth <= 10
}

/** The next physical tree for a collection that already has `existingDepths`. */
export function nextTreeSpec(existingDepths: readonly number[]): TreeSpec | null {
  for (const spec of TREE_PLAN) {
    if (!existingDepths.includes(spec.maxDepth)) return spec
  }
  return null
}

export interface TreeCost {
  bytes: number
  lamports: bigint
  sol: string
}

/** Lamports -> a SOL decimal string, without floats (1 SOL = 1e9 lamports). */
export function lamportsToSol(lamports: bigint): string {
  const neg = lamports < 0n
  const abs = neg ? -lamports : lamports
  const whole = abs / 1_000_000_000n
  const frac = (abs % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
  const s = frac ? `${whole}.${frac}` : `${whole}`
  return neg ? `-${s}` : s
}

/**
 * Rent is deterministic; this is a read-only RPC call and costs nothing. Used for a sanity
 * bound and (in the isolated-signer model) the declaredUsd the signer checks against
 * simulation. USD conversion is left to the caller so this stays currency-free.
 */
export async function estimateTreeCost(umi: Umi, spec: TreeSpec): Promise<TreeCost> {
  const bytes = getMerkleTreeSize(spec.maxDepth, spec.maxBufferSize, spec.canopyDepth)
  const rent = await umi.rpc.getRent(bytes)
  const lamports = rent.basisPoints
  return { bytes, lamports, sol: lamportsToSol(lamports) }
}
