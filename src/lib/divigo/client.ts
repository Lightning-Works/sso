/**
 * DiviGo API client — SERVER-SIDE ONLY (uses a secret API key).
 * Never import this into a client component.
 *
 * Source of truth: DiviGoReboot `API_README.md` (github.com/DiviGoApp/v2).
 * Gateway: POST {DIVIGO_API_BASE}/api  with JSON { secret, method, ...params }.
 *
 * Non-custodial by design: `requestTransfer` does NOT move funds — it asks
 * DiviGo to message the user (Telegram) for approval; DiviGo holds the keys
 * and sends from its pool only after the user approves, then debits their
 * balance. We never touch private keys.
 *
 * NOT YET LIVE: DiviGo has not issued us an API key. Every call throws
 * DiviGoNotConfiguredError until DIVIGO_API_KEY is set. Also pending from
 * the DiviGo team: prod base URL confirm, our server IP added to their
 * ALLOWED_TX_IPS, the SSO-user -> DiviGo-account mapping, and confirmation
 * of how to read a user's balance/staking. See docs/DIVIGO-INTEGRATION.md.
 */

const BASE = (process.env.DIVIGO_API_BASE || 'https://divigo.com').replace(/\/+$/, '')
const KEY = process.env.DIVIGO_API_KEY || ''

export class DiviGoNotConfiguredError extends Error {
  constructor() {
    super('DiviGo API key not configured — set DIVIGO_API_KEY (pending issuance by the DiviGo team).')
    this.name = 'DiviGoNotConfiguredError'
  }
}

export function diviGoConfigured(): boolean {
  return KEY.length > 0
}

export type MsgRoute = 'telegram' | 'wa' | 'whatsapp' | 'meta' | 'signal'

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
 * Ask a user to approve sending crypto OUT of their DiviGo balance.
 * DiviGo messages them (e.g. Telegram) to approve; on approval it sends
 * from the pool and debits their balance. Returns a request code — poll
 * its status with checkRequest().
 */
export function requestTransfer(p: {
  number: string            // the user's DiviGo identifier (phone/handle per their account)
  route: MsgRoute           // messaging platform to ask for approval on, e.g. 'telegram'
  coin: string              // e.g. 'divi'
  amount: string | number
  destination: string       // address the funds should be sent to
  company: string           // shown to the user in the approval prompt
  subject: string           // shown to the user in the approval prompt
}): Promise<unknown> {
  return callApi('request', {
    number: p.number, route: p.route, coin: p.coin,
    amount: String(p.amount), destination: p.destination,
    company: p.company, subject: p.subject,
  })
}

/** Poll the status of a request created by requestTransfer(). */
export function checkRequest(code: string): Promise<unknown> {
  return callApi('check', { code })
}

/** Credit ("award") crypto INTO a user's DiviGo balance (e.g. game rewards). */
export function award(p: { number: string; coin: string; amount: string | number }): Promise<unknown> {
  return callApi('award', { number: p.number, coin: p.coin, amount: String(p.amount) })
}

/** Resolve / verify a game user's DiviGo account. */
export function getGameUser(p: { user: string; route: MsgRoute }): Promise<unknown> {
  return callApi('gameuser', { user: p.user, route: p.route })
}

/** Current coin price per DiviGo. */
export function getPrice(coin = 'divi'): Promise<unknown> {
  return callApi('price', { coin })
}
