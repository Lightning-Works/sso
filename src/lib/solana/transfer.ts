// Solana compressed-NFT (cNFT) transfer BUILDER for LW-SSO.
//
// SSO builds an UNSIGNED transfer transaction; it holds NO user key. DiviGo (which
// holds the user's custodial keypair) deserializes the returned bytes, signs, and
// broadcasts. So this module needs no secret at all: least privilege by design.
//
// Devnet-proven 2026-09-15 (create -> mint -> SSO builds unsigned -> DiviGo signs
// with the user key -> broadcast -> owner moved). Design:
// /Users/geoffreymccabe/DIVIGO-SSO-CNFT-PLAN.md flow (C).
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { signerIdentity, createNoopSigner, publicKey } from '@metaplex-foundation/umi'
import type { Umi } from '@metaplex-foundation/umi'
import {
  mplBubblegum,
  transfer,
  getAssetWithProof,
} from '@metaplex-foundation/mpl-bubblegum'
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api'
import type { DasApiInterface } from '@metaplex-foundation/digital-asset-standard-api'
import { getSolanaRpc } from './config'

// `.use(dasApi())` adds the DAS rpc methods at runtime, but the base `Umi` type
// doesn't reflect it, so getAssetWithProof (which requires a DAS-typed rpc) won't
// type-check without this. Runtime behavior is proven on devnet 2026-09-15.
type DasUmi = Umi & { rpc: Umi['rpc'] & DasApiInterface }

export interface BuildCnftTransferInput {
  assetId: string
  from: string // current owner (the DiviGo user's custodial pubkey)
  to: string // recipient pubkey
  // Optional fee payer. Defaults to `from` (the user pays their own fee). Pass a
  // DiviGo treasury pubkey to have the treasury front the fee; DiviGo then signs
  // with BOTH the user key and the treasury key before broadcasting.
  feePayer?: string
}

export interface BuildCnftTransferResult {
  // base64-encoded, UNSIGNED VersionedTransaction. DiviGo must sign + broadcast.
  transaction: string
  assetId: string
  from: string
  to: string
  feePayer: string
}

/**
 * Build an unsigned cNFT transfer. Fetches the Merkle proof (DAS getAssetWithProof,
 * canopy-truncated so the proof fits in one transaction) and compiles a transfer
 * whose only required signer is the owner (`from`) — left UNSIGNED here. Returns
 * base64 for DiviGo to sign with the user's key and broadcast.
 */
export async function buildCnftTransfer(
  input: BuildCnftTransferInput
): Promise<BuildCnftTransferResult> {
  const feePayer = input.feePayer ?? input.from

  // Keyless umi: identity/fee-payer are NOOP signers (public key only), so the
  // built transaction is unsigned and carries no secret.
  const umi = createUmi(getSolanaRpc()).use(mplBubblegum()).use(dasApi()) as DasUmi
  const ownerNoop = createNoopSigner(publicKey(input.from))
  const payerNoop = createNoopSigner(publicKey(feePayer))
  umi.use(signerIdentity(payerNoop))

  const assetWithProof = await getAssetWithProof(umi, publicKey(input.assetId), {
    truncateCanopy: true,
  })

  const builder = transfer(umi, {
    ...assetWithProof,
    leafOwner: ownerNoop,
    newLeafOwner: publicKey(input.to),
  })

  const built = await builder.setLatestBlockhash(umi).then((b) => b.build(umi))
  const bytes = umi.transactions.serialize(built)
  const transaction = Buffer.from(bytes).toString('base64')

  return { transaction, assetId: input.assetId, from: input.from, to: input.to, feePayer }
}
