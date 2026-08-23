/**
 * Dedicated mining key — true hands-free auto-mining without wallet popups.
 *
 * How it works (the standard safe pattern for WAX miners):
 *   1. Generate a keypair in the browser; store the PRIVATE key locally.
 *   2. One-time on-chain setup (signed once via the wallet): create a custom
 *      `mine` permission holding that public key, and linkauth it to ONLY
 *      m.federation::mine. Because `mine` is a child of `active`, it CANNOT
 *      satisfy `active` (parent) requirements — so this key can mine and nothing
 *      else. It can never move funds, stake, or transfer.
 *   3. Auto-mining then signs each mine locally with this restricted key and
 *      broadcasts directly — no popup, fully unattended.
 *   4. Remove anytime: unlinkauth + deleteauth on-chain and wipe the local key.
 *
 * Security: the key is powerless beyond mining, so a leaked local key only lets
 * someone mine on your behalf. We still keep it client-only and revocable.
 */
import type { WaxAction as AwAction } from '@/lib/wallets/waxSession'

const RPC = 'https://wax.greymass.com'
const keyOf = (a: string) => `aww-minekey-${a}`

export function getMiningKey(account: string): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(keyOf(account)) : null } catch { return null }
}
export function hasMiningKey(account: string): boolean { return !!getMiningKey(account) }
export function clearMiningKey(account: string) { try { window.localStorage.removeItem(keyOf(account)) } catch { /* ignore */ } }

/** Generate a keypair, save the private key locally, return the public key. */
export async function generateMiningKey(account: string): Promise<string> {
  const { PrivateKey } = await import('@wharfkit/antelope')
  const priv = PrivateKey.generate('K1')
  const pub = priv.toPublic().toString()
  try { window.localStorage.setItem(keyOf(account), priv.toString()) } catch { /* ignore */ }
  return pub
}

/** One-time setup, signed by `active` via the wallet: create + link the mine permission. */
export function buildSetupActions(account: string, pubKey: string): AwAction[] {
  const authorization = [{ actor: account, permission: 'active' }]
  return [
    { account: 'eosio', name: 'updateauth', authorization, data: { account, permission: 'mine', parent: 'active', auth: { threshold: 1, keys: [{ key: pubKey, weight: 1 }], accounts: [], waits: [] } } },
    { account: 'eosio', name: 'linkauth', authorization, data: { account, code: 'm.federation', type: 'mine', requirement: 'mine' } },
  ]
}

/** Remove the mine permission on-chain (signed by active via the wallet). */
export function buildRevokeActions(account: string): AwAction[] {
  const authorization = [{ actor: account, permission: 'active' }]
  return [
    { account: 'eosio', name: 'unlinkauth', authorization, data: { account, code: 'm.federation', type: 'mine' } },
    { account: 'eosio', name: 'deleteauth', authorization, data: { account, permission: 'mine' } },
  ]
}

/** Does the account currently have the `mine` permission on-chain? */
export async function checkMinePermission(account: string): Promise<boolean> {
  try {
    const r = await fetch(`${RPC}/v1/chain/get_account`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ account_name: account }) })
    const d = await r.json()
    return (d.permissions || []).some((p: { perm_name?: string }) => p.perm_name === 'mine')
  } catch { return false }
}

/** Sign + broadcast a mine using the LOCAL mining key (no wallet, no popup). */
export async function signMineWithKey(account: string, nonce: string): Promise<string> {
  const privStr = getMiningKey(account)
  if (!privStr) throw new Error('No mining key set up on this device')
  const { APIClient, PrivateKey, Action, Transaction, SignedTransaction } = await import('@wharfkit/antelope')
  const priv = PrivateKey.from(privStr)
  const client = new APIClient({ url: RPC })
  const info = await client.v1.chain.get_info()
  const abi = (await client.v1.chain.get_abi('m.federation')).abi
  const action = Action.from({ account: 'm.federation', name: 'mine', authorization: [{ actor: account, permission: 'mine' }], data: { miner: account, nonce } }, abi)
  const tx = Transaction.from({ ...info.getTransactionHeader(120), actions: [action] })
  const sig = priv.signDigest(tx.signingDigest(info.chain_id))
  const signed = SignedTransaction.from({ ...tx, signatures: [sig] })
  try {
    const res = await client.v1.chain.push_transaction(signed) as { transaction_id?: string }
    return String(res.transaction_id || 'sent')
  } catch (err) {
    // Surface the real on-chain assert message (e.g. "mine is on cooldown").
    const e = err as { message?: string; details?: { message?: string }[]; response?: { json?: { error?: { details?: { message?: string }[]; what?: string } } } }
    const det = e.details || e.response?.json?.error?.details
    const assertMsg = Array.isArray(det) ? det.map(d => d.message).filter(Boolean).join(' | ') : ''
    throw new Error(assertMsg || e.response?.json?.error?.what || e.message || 'transaction rejected')
  }
}
