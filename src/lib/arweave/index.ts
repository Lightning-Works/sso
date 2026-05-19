/**
 * Independent, reusable Arweave storage module.
 *
 * No coupling to the SSO/comics — safe to copy into the Kinetink app or
 * anywhere. Permanent (pay-once) storage: each upload returns a tx id and
 * a gateway URL that never expires.
 *
 * Config (server-side env only):
 *   ARWEAVE_JWK       — REQUIRED. The wallet key as a JSON string.
 *   ARWEAVE_GATEWAY   — optional, default https://arweave.net
 *   ARWEAVE_HOST/PORT/PROTOCOL — optional node override.
 *
 * Inert until configured: arweaveConfigured() is false and any put()
 * throws ArweaveNotConfigured, so nothing breaks before you have a key.
 * Requires the `arweave` package (npm i arweave) — loaded dynamically so
 * the app builds/runs fine without it until you opt in.
 *
 * Flexible by design: every put() takes free-form tags, so the same
 * module backs up any variant (full / highres / lowres / thumb / atlas /
 * future) — the caller decides what to store and how to record it.
 */

export class ArweaveNotConfigured extends Error {
  constructor(msg = 'Arweave not configured — set ARWEAVE_JWK (and `npm i arweave`).') {
    super(msg); this.name = 'ArweaveNotConfigured'
  }
}

const GATEWAY = (process.env.ARWEAVE_GATEWAY || 'https://arweave.net').replace(/\/+$/, '')

export const arweaveUrl = (txId: string) => `${GATEWAY}/${txId}`
export function arweaveConfigured(): boolean { return !!process.env.ARWEAVE_JWK }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _jwk: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any> {
  if (!process.env.ARWEAVE_JWK) throw new ArweaveNotConfigured()
  if (_client) return _client
  const pkgName: string = 'arweave' // typed as string so TS won't resolve it pre-install
  let mod: unknown
  try {
    mod = await import(/* webpackIgnore: true */ pkgName)
  } catch {
    throw new ArweaveNotConfigured('The `arweave` package is not installed. Run: npm i arweave')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Arweave: any = (mod as any).default ?? mod
  const host = process.env.ARWEAVE_HOST || new URL(GATEWAY).hostname
  _client = Arweave.init({
    host,
    port: process.env.ARWEAVE_PORT ? Number(process.env.ARWEAVE_PORT) : 443,
    protocol: process.env.ARWEAVE_PROTOCOL || 'https',
    timeout: 60000,
  })
  _jwk = JSON.parse(process.env.ARWEAVE_JWK as string)
  return _client
}

export interface ArweaveTag { name: string; value: string }
export interface ArweavePutResult { id: string; url: string }

/**
 * Permanently store bytes on Arweave. `tags` are arbitrary metadata
 * (e.g. App, Comic, Page, Variant) so one store serves many use cases.
 */
export async function arweavePut(
  data: Uint8Array,
  contentType: string,
  tags: ArweaveTag[] = [],
): Promise<ArweavePutResult> {
  const ar = await getClient()
  const tx = await ar.createTransaction({ data }, _jwk)
  tx.addTag('Content-Type', contentType)
  for (const t of tags) tx.addTag(t.name, t.value)
  await ar.transactions.sign(tx, _jwk)
  const res = await ar.transactions.post(tx)
  if (res.status >= 300) throw new Error(`Arweave post failed (HTTP ${res.status})`)
  return { id: tx.id as string, url: arweaveUrl(tx.id as string) }
}

/** Rough price estimate (AR) for storing `bytes` — for the admin UI. */
export async function arweavePriceAR(bytes: number): Promise<string | null> {
  try {
    const ar = await getClient()
    const winston = await ar.transactions.getPrice(bytes)
    return ar.ar.winstonToAr(winston)
  } catch { return null }
}
