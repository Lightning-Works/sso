/**
 * Alien Worlds Teleport (TLM bridge) — WAX side, verified against the live
 * `other.worlds` bridge contract and real teleport transactions.
 *
 * WAX → another chain is ONE transaction, two actions (exactly as real teleports):
 *   1. alien.worlds::transfer(from → other.worlds, quantity, memo "Teleport")
 *   2. other.worlds::teleport(from, quantity, chain_id, eth_address)
 *
 * The 6 live oracles then sign it and the user CLAIMS the BEP-20 TLM on Binance
 * (a MetaMask + BNB-gas step) — Phase 1 hands that off to teleport.alienworlds.io;
 * a later phase does the claim in-app with our EVM wallet.
 *
 * chain_id: 1 = Ethereum, 2 = Binance Smart Chain (confirmed on-chain).
 * eth_address is a checksum256: the 20-byte EVM address, right-padded with zeros
 * to 32 bytes (e.g. "<40 hex addr>" + 24 hex zeros).
 */
import type { WaxAction as AwAction } from '@/lib/wallets/waxSession'

export const CHAIN_BSC = 2
export const CHAIN_ETH = 1
export const MIN_TLM = 100 // Alien Worlds bridge minimum; the contract enforces the exact rule.
export const CLAIM_URL = 'https://teleport.alienworlds.io/'

/** True for a well-formed EVM address (0x + 40 hex). */
export function isEvmAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim())
}

/** EVM address → checksum256 the bridge expects (20 bytes, zero-padded to 32). */
export function encodeEvmAddress(a: string): string {
  const hex = a.trim().replace(/^0x/i, '').toLowerCase()
  return hex + '0'.repeat(64 - hex.length)
}

const tlmAsset = (amount: number) => `${amount.toFixed(4)} TLM`

/** The two WAX-side actions for a teleport (default destination: Binance). */
export function buildTeleportActions(account: string, amountTlm: number, evmAddress: string, chainId: number = CHAIN_BSC): AwAction[] {
  const authorization = [{ actor: account, permission: 'active' }]
  const quantity = tlmAsset(amountTlm)
  return [
    { account: 'alien.worlds', name: 'transfer', authorization, data: { from: account, to: 'other.worlds', quantity, memo: 'Teleport' } },
    { account: 'other.worlds', name: 'teleport', authorization, data: { from: account, quantity, chain_id: chainId, eth_address: encodeEvmAddress(evmAddress) } },
  ]
}
