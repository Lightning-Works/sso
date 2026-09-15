// Solana compressed-NFT (cNFT) minting for LW-SSO.
//
// SSO is the one place that mints reward cNFTs for the ecosystem. The mint
// authority keypair lives ONLY in a server env var (SOLANA_MINT_AUTHORITY_SECRET);
// this module never runs in the browser. RPC reuses the Helius endpoint from
// src/lib/blockchain/rpc.ts. Design: /Users/geoffreymccabe/DIVIGO-SSO-CNFT-PLAN.md.
//
// Devnet-proven flow (create tree -> mint -> transfer): the transfer half lives in
// ./transfer.ts. One Merkle tree per game/collection.
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
  keypairIdentity,
  generateSigner,
  publicKey,
  none,
  type Umi,
  type PublicKey,
} from '@metaplex-foundation/umi'
import {
  mplBubblegum,
  createTree,
  mintV1,
  findLeafAssetIdPda,
  findTreeConfigPda,
  safeFetchTreeConfig,
  parseLeafFromMintV1Transaction,
} from '@metaplex-foundation/mpl-bubblegum'
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api'
import { SOLANA_RPC } from '@/lib/blockchain/rpc'

// SOLANA_MINT_AUTHORITY_SECRET accepts a base58 string OR a JSON byte array (both
// common export formats). Server-only; never NEXT_PUBLIC.
let _umi: Umi | null = null
function getUmi(): Umi {
  if (_umi) return _umi
  const umi = createUmi(SOLANA_RPC).use(mplBubblegum()).use(dasApi())
  const raw = (process.env.SOLANA_MINT_AUTHORITY_SECRET || '').trim()
  if (!raw) throw new Error('SOLANA_MINT_AUTHORITY_SECRET is not set')
  const secret = raw.startsWith('[')
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58Decode(raw)
  const kp = umi.eddsa.createKeypairFromSecretKey(secret)
  umi.use(keypairIdentity(kp))
  _umi = umi
  return umi
}

// Minimal base58 decode (Bitcoin alphabet) to avoid an extra dependency.
function bs58Decode(str: string): Uint8Array {
  const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const bytes: number[] = [0]
  for (const ch of str) {
    const val = ALPH.indexOf(ch)
    if (val < 0) throw new Error('invalid base58 in mint authority secret')
    let carry = val
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8 }
  }
  for (let k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0)
  return Uint8Array.from(bytes.reverse())
}

export interface CreateTreeResult {
  treeAddress: string
  signature: string
}

/**
 * Create a new Bubblegum Merkle tree (one per game/collection). Run once per
 * collection; store `treeAddress` in the `cnft_trees` table.
 * maxDepth 14 / maxBufferSize 64 ~= 16,384 cNFTs; raise for bigger collections.
 *
 * canopyDepth caches the top of the proof ON-CHAIN. This matters for TRANSFERS:
 * DiviGo builds a cNFT transfer from the proof, and a Solana tx can only hold a
 * small proof. Without enough canopy, a deep tree's transfer proof won't fit.
 * Rule of thumb: keep (maxDepth - canopyDepth) <= ~5. Higher canopy costs more
 * rent at tree-creation time (paid once). Proven on devnet 2026-09-15.
 */
export async function createCollectionTree(opts?: {
  maxDepth?: number
  maxBufferSize?: number
  canopyDepth?: number
}): Promise<CreateTreeResult> {
  const umi = getUmi()
  const merkleTree = generateSigner(umi)
  const maxDepth = opts?.maxDepth ?? 14
  // default canopy keeps transfer proofs small enough to fit in one transaction
  const canopyDepth = opts?.canopyDepth ?? Math.max(0, maxDepth - 5)
  const builder = await createTree(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize: opts?.maxBufferSize ?? 64,
    canopyDepth,
  })
  const res = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })
  return {
    treeAddress: merkleTree.publicKey.toString(),
    signature: base58Signature(res.signature),
  }
}

export interface MintCnftInput {
  treeAddress: string
  recipient: string // Solana pubkey to receive the cNFT
  name: string
  uri: string // metadata JSON or image URI
  sellerFeeBasisPoints?: number
}

export interface MintCnftResult {
  assetId: string
  signature: string
}

/**
 * Mint a compressed NFT into `treeAddress`, owned by `recipient`.
 * Returns the derived asset id + tx signature (verifiable on-chain).
 */
export async function mintCnft(input: MintCnftInput): Promise<MintCnftResult> {
  const umi = getUmi()
  const tree = publicKey(input.treeAddress)
  const leafOwner = publicKey(input.recipient) as PublicKey

  // Read the tree's mint counter BEFORE minting: numMinted is exactly the leaf
  // index this mint will occupy. This is the reliable fallback if the tx parse
  // below can't run yet. (Mint destination in one tree should be serialized so
  // two mints don't read the same counter; the tx parse is the authoritative
  // cross-check.)
  const [treeConfigPda] = findTreeConfigPda(umi, { merkleTree: tree })
  const cfgPre = await safeFetchTreeConfig(umi, treeConfigPda)
  const counterLeafIndex = cfgPre ? Number(cfgPre.numMinted) : 0

  const res = await mintV1(umi, {
    leafOwner,
    merkleTree: tree,
    metadata: {
      name: input.name,
      uri: input.uri,
      sellerFeeBasisPoints: input.sellerFeeBasisPoints ?? 0,
      collection: none(),
      creators: [],
    },
  }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })

  // Authoritative leaf index: parse it out of the confirmed mint tx. The tx can
  // take a moment to be fetchable, so retry a few times; fall back to the
  // pre-mint counter. Proven on devnet 2026-09-15 (both agree). This replaces
  // the old hardcoded leafIndex:0 that was only correct for a tree's first mint.
  let leafIndex = counterLeafIndex
  for (let i = 0; i < 8; i++) {
    try {
      const leaf = await parseLeafFromMintV1Transaction(umi, res.signature)
      leafIndex = Number(leaf.nonce)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 2500))
    }
  }

  const [assetId] = findLeafAssetIdPda(umi, { merkleTree: tree, leafIndex })
  return { assetId: assetId.toString(), signature: base58Signature(res.signature) }
}

// umi returns the signature as bytes; present it as base58 for Solscan links.
function base58Signature(sig: Uint8Array): string {
  const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = 0n
  for (const b of sig) num = num * 256n + BigInt(b)
  let out = ''
  while (num > 0n) { out = ALPH[Number(num % 58n)] + out; num /= 58n }
  for (const b of sig) { if (b === 0) out = '1' + out; else break }
  return out
}
