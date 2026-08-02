/**
 * WAX signing session for AWW.
 *
 * Wraps the WAX Cloud Wallet (@waxio/waxjs — already a dependency of the SSO)
 * as a small singleton so features can connect once and submit signed
 * transactions. No new package is added. Dynamic import keeps it out of SSR.
 *
 * CRITICAL — popup / user-gesture timing:
 *   waxjs `login()` calls `window.open()` synchronously at the start of its
 *   async body. Browsers only allow that popup (and let it post the session
 *   back to us) if `login()` runs in the SAME synchronous tick as the user's
 *   click — i.e. with NO `await` before it. So we must NOT `await import(...)`
 *   inside the click handler. Instead we PRELOAD the module + construct the
 *   WaxJS instance ahead of time (on module load); then `connectWax()` calls
 *   `login()` immediately. Without this the wallet opens but AWW never receives
 *   the account — the "logged in but not connected" symptom.
 *
 * Action data is built by the feature modules from ABIs verified on-chain
 * (eosio::delegatebw/voteproducer, token.worlds::stake, dao.worlds::votecust).
 * Signing happens in the user's WAX Cloud Wallet — this module never sees a key.
 */

export type AwAuth = { actor: string; permission: string }
export type AwAction = { account: string; name: string; authorization: AwAuth[]; data: Record<string, unknown> }

interface WaxLike {
  user?: { account?: string } | null
  login(): Promise<string>
  isAutoLoginAvailable(): Promise<boolean>
  api: {
    transact(
      tx: { actions: AwAction[] },
      opts: { blocksBehind: number; expireSeconds: number },
    ): Promise<{ transaction_id?: string }>
  }
}

const WAX_RPC = 'https://wax.greymass.com'

let wax: WaxLike | null = null
let waxPromise: Promise<WaxLike> | null = null
let account: string | null = null

// Import + construct the WaxJS instance exactly once. Cached as a promise so
// concurrent callers share one build.
async function build(): Promise<WaxLike> {
  const mod = await import('@waxio/waxjs/dist')
  const WaxJS = (mod as unknown as { WaxJS: new (o: { rpcEndpoint: string; tryAutoLogin?: boolean }) => WaxLike }).WaxJS
  const instance = new WaxJS({ rpcEndpoint: WAX_RPC, tryAutoLogin: true })
  wax = instance
  return instance
}

/**
 * Warm up the wallet library so the connect click doesn't have to await an
 * import (which would break the popup). Safe to call repeatedly.
 */
export function preloadWax(): Promise<WaxLike> {
  if (!waxPromise) waxPromise = build()
  return waxPromise
}

// Eagerly preload the moment this module is imported in the browser, so the
// instance is ready long before the user clicks Connect.
if (typeof window !== 'undefined') {
  preloadWax().catch(() => { /* retried on demand in connectWax */ })
}

export async function connectWax(): Promise<string | null> {
  // If the instance is already built (the normal case, thanks to preload),
  // `wax ?? ...` short-circuits so there is NO await before login() — the popup
  // opens inside the user gesture. Only the (rare) cold path awaits the build.
  const w = wax ?? (await preloadWax())
  const a = await w.login()
  account = a || (w.user?.account ?? null)
  return account
}

/**
 * Silently restore a previous WAX Cloud Wallet session on load — NO popup.
 * MyCloudWallet keeps the user logged in for a while; isAutoLoginAvailable()
 * reconnects using that existing session so the user doesn't have to click
 * Connect again after a refresh. Returns the account, or null if there's no
 * live session (in which case the user connects normally).
 */
export async function autoLoginWax(): Promise<string | null> {
  try {
    const w = wax ?? (await preloadWax())
    if (await w.isAutoLoginAvailable()) {
      account = w.user?.account ?? account
      return account
    }
  } catch { /* no live session — user will connect manually */ }
  return null
}

export function currentAccount(): string | null {
  return account
}

/** Authorization array for the connected account's active permission. */
export function auth(): AwAuth[] {
  return account ? [{ actor: account, permission: 'active' }] : []
}

export async function transact(actions: AwAction[]): Promise<{ transaction_id?: string }> {
  if (!wax || !account) throw new Error('WAX wallet not connected')
  return wax.api.transact({ actions }, { blocksBehind: 3, expireSeconds: 120 })
}
