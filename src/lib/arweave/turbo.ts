/**
 * Turbo (ArDrive) provider — pay for Arweave with a CARD or EVM CRYPTO,
 * no AR token needed. Independent/reusable like ./index.ts.
 *
 * Model: ONE wallet funds + signs everything. Configure ONE of:
 *   TURBO_ETH_KEY  — an Ethereum private key (recommended: lets you fund
 *                    by card AND by MetaMask into the SAME account).
 *   ARWEAVE_JWK    — an Arweave JWK (card top-up only).
 * Optional: TURBO_PAYMENT_URL / TURBO_UPLOAD_URL overrides.
 *
 * Inert until configured; needs `@ardrive/turbo-sdk` (npm i — flagged,
 * not auto-installed). Dynamic-imported so the app builds without it.
 */

export class TurboNotConfigured extends Error {
  constructor(msg = 'Turbo not configured — set TURBO_ETH_KEY or ARWEAVE_JWK and `npm i @ardrive/turbo-sdk`.') {
    super(msg); this.name = 'TurboNotConfigured'
  }
}

export function turboConfigured(): boolean {
  return !!(process.env.TURBO_ETH_KEY || process.env.ARWEAVE_JWK)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: any = null
async function sdk() {
  if (_sdk) return _sdk
  const pkg: string = '@ardrive/turbo-sdk'
  try { _sdk = await import(/* webpackIgnore: true */ pkg) }
  catch { throw new TurboNotConfigured('The `@ardrive/turbo-sdk` package is not installed. Run: npm i @ardrive/turbo-sdk') }
  return _sdk
}

/** Authenticated Turbo client + the account address it credits/signs as. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authed(): Promise<{ turbo: any; address: string; token: 'ethereum' | 'arweave' }> {
  if (!turboConfigured()) throw new TurboNotConfigured()
  const S = await sdk()
  const { TurboFactory, EthereumSigner, ArweaveSigner } = S
  if (process.env.TURBO_ETH_KEY) {
    const signer = new EthereumSigner(process.env.TURBO_ETH_KEY)
    const turbo = TurboFactory.authenticated({ signer, token: 'ethereum' })
    const address: string = await signer.getAddress?.() ?? (await turbo.signer?.getNativeAddress?.())
    return { turbo, address, token: 'ethereum' }
  }
  const jwk = JSON.parse(process.env.ARWEAVE_JWK as string)
  const signer = new ArweaveSigner(jwk)
  const turbo = TurboFactory.authenticated({ signer })
  const address: string = await turbo.signer.getNativeAddress()
  return { turbo, address, token: 'arweave' }
}

export interface TurboPutResult { id: string; url: string }

/** Upload bytes via Turbo (paid from prepaid credits). Returns AR tx id. */
export async function turboUpload(
  data: Uint8Array, contentType: string, tags: { name: string; value: string }[] = [],
): Promise<TurboPutResult> {
  const { turbo } = await authed()
  const { Readable } = await import('node:stream')
  const buf = Buffer.from(data)
  const res = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(buf),
    fileSizeFactory: () => buf.length,
    dataItemOpts: { tags: [{ name: 'Content-Type', value: contentType }, ...tags] },
  })
  const id = res.id as string
  const gw = (process.env.ARWEAVE_GATEWAY || 'https://arweave.net').replace(/\/+$/, '')
  return { id, url: `${gw}/${id}` }
}

/** Remaining balance in winc (winston credits) for the configured wallet. */
export async function turboBalance(): Promise<{ winc: string; address: string }> {
  const { turbo, address } = await authed()
  const { winc } = await turbo.getBalance()
  return { winc: String(winc), address }
}

/**
 * Create a hosted Stripe checkout to buy upload credits with a CARD.
 * Credits land on the configured wallet (which also does the uploads).
 */
export async function turboCardCheckout(usd: number): Promise<{ url: string; winc?: string }> {
  const S = await sdk()
  const { turbo, address } = await authed()
  const session = await turbo.createCheckoutSession({ amount: S.USD(usd), owner: address })
  return { url: session.url as string, winc: session.winc ? String(session.winc) : undefined }
}
