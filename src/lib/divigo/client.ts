/**
 * DiviGo API client — SERVER-SIDE ONLY (uses a secret API key).
 * Never import this into a client component.
 *
 * Source of truth: DiviGoReboot `src/controllers/api.js` (github.com/DiviGoApp/v2).
 * Gateway: POST {DIVIGO_API_BASE}/api  with JSON { secret, method, ...params }.
 *
 * Non-custodial by design: `requestTransfer` does NOT move funds — it asks
 * DiviGo to message the user (Telegram/WhatsApp) for approval; DiviGo holds
 * the keys and sends from its pool only after the user approves, then debits
 * their balance. We never touch private keys.
 *
 * Config (server env only — never NEXT_PUBLIC):
 *   DIVIGO_API_KEY        — the `secret` (issued by DiviGo)
 *   DIVIGO_PROJECT_NAME   — shown to the user in the Telegram approval prompt
 *                           ("LightningWorks wants to send 100 DIVI to...")
 *   DIVIGO_API_BASE       — default https://divigo.com
 *
 * Number / route conventions (verified against api.js + apiBalance.js):
 *   - `number` for phone-based routes (wa, whatsapp): full phone with country
 *      code, '+' optional (server strips it). Must be > 4 chars.
 *   - `number` for telegram routes: the numeric Telegram user ID (no '+').
 *   - `route` values: 'telegram', 'telegramLaunchGoat', 'wa' (== botmaker),
 *      'whatsapp', 'meta', 'signal'. We expose 'telegram' and 'wa' in UI;
 *      the server maps 'wa' → 'botmaker' for us.
 */

const BASE = (process.env.DIVIGO_API_BASE || 'https://divigo.com').replace(/\/+$/, '')
const KEY = process.env.DIVIGO_API_KEY || ''
const PROJECT_NAME = process.env.DIVIGO_PROJECT_NAME || ''

export class DiviGoNotConfiguredError extends Error {
  constructor() {
    super('DiviGo API not configured — set DIVIGO_API_KEY (and DIVIGO_PROJECT_NAME) in the server environment.')
    this.name = 'DiviGoNotConfiguredError'
  }
}

export function diviGoConfigured(): boolean {
  return KEY.length > 0
}

/** The DiviGo project name shown in approval prompts. Used as default
 *  `company` when our routes call requestTransfer. */
export function diviGoProjectName(): string {
  return PROJECT_NAME
}

export type MsgRoute = 'telegram' | 'telegramLaunchGoat' | 'wa' | 'whatsapp' | 'meta' | 'signal'

async function callApi(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!KEY) throw new DiviGoNotConfiguredError()
  const res = await fetch(`${BASE}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: KEY, method, ...params }),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)
    throw new Error(`DiviGo ${method} HTTP ${res.status}: ${detail}`)
  }
  return data
}

/**
 * Read a user's DiviGo balance.
 *
 *   coin === 'all'  → returns a map of non-zero balances: { divi: 100, btc: 0.05 }
 *                     (the server iterates [divi, btc, eth, ltc, doge, core])
 *   coin === 'divi' → returns a single number, or null if no wallet
 *
 * For DIVI auto wallets the returned number is effectively the *staking* value
 * (apiBalance substitutes staking for balance when staking is defined). So a
 * user with 436,864 DIVI in DiviGo will see that figure.
 *
 * Note: a user that doesn't exist and a user that exists with zero everything
 * both return `{}` for coin='all' — we cannot distinguish them via this API.
 * Verification of account ownership is delegated to the Telegram approval on
 * the first send.
 */
export function balance(p: {
  number: string
  route: MsgRoute
  coin: string | 'all'
}): Promise<unknown> {
  return callApi('balance', { number: p.number, route: p.route, coin: p.coin })
}

/**
 * Ask a user to approve sending crypto OUT of their DiviGo balance.
 * DiviGo messages them (e.g. Telegram) to approve; on approval it sends
 * from the pool and debits their balance. Returns a request code — poll
 * its status with checkRequest().
 *
 * `company` defaults to DIVIGO_PROJECT_NAME so callers don't have to thread
 * it through every request site. Override per-call only if you need to.
 *
 * Returns one of:
 *   - { error: '', code: '<10-char>' }      success
 *   - { error: 'no balance' }                insufficient funds
 *   - false                                  user / wallet doesn't exist
 */
export function requestTransfer(p: {
  number: string
  route: MsgRoute
  coin: string
  amount: string | number
  destination: string
  subject: string
  company?: string
}): Promise<unknown> {
  return callApi('request', {
    number: p.number, route: p.route, coin: p.coin,
    amount: String(p.amount), destination: p.destination,
    company: p.company ?? PROJECT_NAME,
    subject: p.subject,
  })
}

/**
 * Poll the status of a request created by requestTransfer().
 * Returns the `paymentRequestCompleted` value (falsy while pending; truthy
 * once the user has acted — shape determined by DiviGo's webhook handler).
 */
export function checkRequest(code: string): Promise<unknown> {
  return callApi('check', { code })
}

/** Credit ("award") crypto INTO a user's DiviGo balance (e.g. game rewards). */
export function award(p: { number: string; coin: string; amount: string | number }): Promise<unknown> {
  return callApi('award', { number: p.number, coin: p.coin, amount: String(p.amount) })
}

/**
 * Resolve a game user's DiviGo account by their in-game username.
 * Returns { [user]: { number, route } | null }. Used by integrating games,
 * NOT by our link-account flow (we ask the user for their number directly).
 */
export function getGameUser(p: { user: string; route: MsgRoute }): Promise<unknown> {
  return callApi('gameuser', { user: p.user, route: p.route })
}

/** Current coin price per DiviGo. */
export function getPrice(coin = 'divi'): Promise<unknown> {
  return callApi('price', { coin })
}

/**
 * Create a new DiviGo account for a phone+route. Use sparingly — accounts
 * are normally created via the Telegram bot's onboarding flow.
 * Returns true if the account was created.
 */
export function register(p: { number: string; route: MsgRoute }): Promise<unknown> {
  return callApi('register', { number: p.number, route: p.route })
}
