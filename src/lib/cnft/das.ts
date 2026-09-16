/**
 * Direct DAS access over raw JSON-RPC, bypassing the das-api umi plugin.
 *
 * Adapted from crunk.fun. The plugin has version-matrix problems with the pinned Metaplex
 * stack; raw JSON-RPC has none and removes a fragile dependency from the critical path.
 * Devnet DAS indexing lags the chain by MINUTES, and getAssetProof lags getAsset further,
 * so any flow that mints then operates on the asset must be resumable / poll-tolerant.
 */

export interface DasAssetProof {
  root: string
  proof: string[]
  node_index: number
  leaf: string
  tree_id: string
}

export interface DasAsset {
  id: string
  mutable: boolean
  burnt?: boolean
  content: { json_uri: string; metadata: { name: string; symbol?: string } }
  compression: {
    compressed: boolean
    data_hash: string
    creator_hash: string
    asset_hash: string
    tree: string
    leaf_id: number
    seq: number
  }
  ownership: { owner: string; delegate: string | null }
  royalty: { basis_points: number; primary_sale_happened: boolean }
  creators: Array<{ address: string; share: number; verified: boolean }>
  grouping: Array<{ group_key: string; group_value: string }>
}

async function rpc<T>(url: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'lw-cnft', method, params }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json()) as { result?: T; error?: { message?: string } }
  if (json.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`)
  if (json.result === undefined) throw new Error(`${method}: empty result`)
  return json.result
}

export const getAsset = (url: string, id: string) => rpc<DasAsset>(url, 'getAsset', { id })

export const getAssetProof = (url: string, id: string) =>
  rpc<DasAssetProof>(url, 'getAssetProof', { id })

/**
 * Both, with a poll. Devnet DAS lags the chain; callers must tolerate it.
 */
export async function getAssetWithProofRaw(
  url: string,
  id: string,
  opts: { timeoutMs?: number; onWait?: () => void } = {}
): Promise<{ asset: DasAsset; proof: DasAssetProof }> {
  const timeoutMs = opts.timeoutMs ?? 600_000
  const started = Date.now()
  let lastErr = ''
  while (Date.now() - started < timeoutMs) {
    try {
      const [asset, proof] = await Promise.all([getAsset(url, id), getAssetProof(url, id)])
      return { asset, proof }
    } catch (e) {
      lastErr = String((e as Error).message).slice(0, 120)
      opts.onWait?.()
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  throw new Error(`DAS never returned asset+proof for ${id} - last error: ${lastErr}`)
}

/** The leaf index within the tree. node_index is offset by 2^maxDepth. */
export function leafIndexFromProof(proof: DasAssetProof): number {
  return proof.node_index - 2 ** proof.proof.length
}
