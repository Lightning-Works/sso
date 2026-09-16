/**
 * umi <-> treasury-signer wire format. Adapted from crunk.fun.
 *
 * umi's PublicKey is already a branded base58 string and its Instruction is already
 * { programId, keys, data }, so this is a rename + base64 encode. Account ORDER is
 * load-bearing (Solana instructions are positional), so this maps rather than rebuilds.
 */
import type { Instruction, KeypairSigner, TransactionBuilder } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import type { WireInstruction } from './types'

export function instructionToWire(ix: Instruction): WireInstruction {
  return {
    programId: ix.programId,
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey,
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data).toString('base64'),
  }
}

export function builderToWire(builder: TransactionBuilder): WireInstruction[] {
  return builder.getInstructions().map(instructionToWire)
}

/**
 * base58 of the 64-byte secret key, for additionalSigners. This is the ONLY place that
 * touches secret bytes, and only ever the throwaway keypair of a tree/collection account
 * being created in the same transaction - never the treasury key, which this module never has.
 */
export function ephemeralSecretToBase58(signer: KeypairSigner): string {
  return base58.deserialize(signer.secretKey)[0]
}
