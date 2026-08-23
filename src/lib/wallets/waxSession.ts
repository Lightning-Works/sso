/**
 * WAX signing session — built on WharfKit SessionKit.
 *
 * Shared by the Alien Worlds Wallet (src/app/aw/**) and the WAX Send feature
 * on /wallet/wax. Originally lived only under src/app/aw/lib/wax/session.ts;
 * promoted here since it has no Alien-Worlds-specific logic.
 *
 * Why WharfKit instead of raw waxjs: waxjs keeps the session only in memory, so
 * every page reload needs a fresh login (or a third-party cookie to
 * mycloudwallet.com that Safari/Brave block). SessionKit PERSISTS the session in
 * our own localStorage and restores it silently on reload — so you log in once
 * and stay logged in, no popup, no cookie dependency.
 *
 * SSR + popup-gesture safety: the WharfKit modules touch `window`/`document`, so
 * they are dynamically imported and the kit is PRELOADED on mount. connectWax()
 * then calls login() with no preceding await, keeping the popup inside the
 * user's click gesture.
 */
import type { Session, SessionKit } from '@wharfkit/session'

export type WaxAuth = { actor: string; permission: string }
export type WaxAction = { account: string; name: string; authorization: WaxAuth[]; data: Record<string, unknown> }

const RPC = 'https://wax.greymass.com'
const WAX_CHAIN_ID = '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4'

let kit: SessionKit | null = null
let kitPromise: Promise<SessionKit> | null = null
let session: Session | null = null

async function buildKit(): Promise<SessionKit> {
  const [{ SessionKit }, { WalletPluginCloudWallet }, wr] = await Promise.all([
    import('@wharfkit/session'),
    import('@wharfkit/wallet-plugin-cloudwallet'),
    import('@wharfkit/web-renderer'),
  ])
  const WebRenderer = (wr as unknown as { default: new () => unknown }).default
  kit = new SessionKit({
    appName: 'LightningWorks',
    chains: [{ id: WAX_CHAIN_ID, url: RPC }],
    ui: new WebRenderer() as never,
    walletPlugins: [new WalletPluginCloudWallet()],
  })
  return kit
}

/** Warm up SessionKit so the connect click doesn't await an import (popup safety). */
export function preloadWax(): Promise<SessionKit> {
  if (!kitPromise) kitPromise = buildKit()
  return kitPromise
}
if (typeof window !== 'undefined') { preloadWax().catch(() => { /* retried on demand */ }) }

const REMEMBER_KEY = 'lw:wax-session'
function remember(a: string | null) {
  try { if (typeof window !== 'undefined' && a) window.localStorage.setItem(REMEMBER_KEY, a) } catch { /* ignore */ }
}
/** Last connected account, for read-only display before a session restores. */
export function rememberedAccount(): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(REMEMBER_KEY) : null } catch { return null }
}

export async function connectWax(): Promise<string | null> {
  // If preloaded, `kit ?? ...` short-circuits so login() runs with no prior await.
  const k = kit ?? (await preloadWax())
  const res = await k.login()
  session = res.session
  const acct = session.actor.toString()
  remember(acct)
  return acct
}

/** Silently restore a persisted session on load — no popup. */
export async function autoLoginWax(): Promise<string | null> {
  try {
    const k = kit ?? (await preloadWax())
    const s = await k.restore()
    if (s) { session = s; const a = s.actor.toString(); remember(a); return a }
  } catch { /* no stored session — user connects manually */ }
  return null
}

export function currentAccount(): string | null {
  return session ? session.actor.toString() : null
}

/** Authorization array for the connected account's active permission. */
export function auth(): WaxAuth[] {
  return session ? [{ actor: session.actor.toString(), permission: session.permission.toString() }] : []
}

export async function transact(actions: WaxAction[]): Promise<{ transaction_id?: string }> {
  if (!session) throw new Error('WAX wallet not connected')
  const result = await session.transact({ actions })
  const resp = result.response as { transaction_id?: string } | undefined
  return { transaction_id: resp?.transaction_id }
}
