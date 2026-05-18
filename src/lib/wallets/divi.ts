/**
 * Divi Wallet Module
 * Uses sign-and-verify flow via Divi RPC (verifymessage)
 */

import type { ConnectedWallet } from './types'
import { shortenAddress } from './types'

// Divi mainnet JSON-RPC (public, no auth). The old /testnet/rpc/ was the
// docs page, not the endpoint — the real one is /api/rpc/. Overridable via
// NEXT_PUBLIC_DIVI_RPC (e.g. a credentialed node) with no code change.
export const DIVI_RPC =
  process.env.NEXT_PUBLIC_DIVI_RPC || 'https://services.divi.domains/api/rpc/'

/**
 * Validate a Divi address (base58, starts with D, typical length 34)
 */
export function validateDiviAddress(address: string): boolean {
  return /^D[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)
}

/**
 * Generate a challenge message for the user to sign
 */
export function generateDiviChallenge(): { message: string; nonce: string } {
  const nonce = crypto.randomUUID()
  const message = `Sign this message to link your DIVI wallet to LightningWorks SSO.\n\nNonce: ${nonce}`
  return { message, nonce }
}

/**
 * Verify a signed message via Divi RPC verifymessage
 */
export async function verifyDiviSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const res = await fetch(DIVI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'sso-verify',
        method: 'verifymessage',
        params: [address, signature, message],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return data.result === true
  } catch (error) {
    console.error('Divi verifymessage error:', error)
    return false
  }
}

export function formatDiviWallet(address: string): ConnectedWallet {
  return {
    chain: 'divi',
    provider: 'divi',
    address,
    displayAddress: shortenAddress(address),
    chainName: 'Divi',
  }
}
