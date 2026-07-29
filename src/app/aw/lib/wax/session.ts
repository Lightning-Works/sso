/**
 * WAX signing session for AWW.
 *
 * Wraps the WAX Cloud Wallet (@waxio/waxjs — already a dependency of the SSO)
 * as a small singleton so features can connect once and submit signed
 * transactions. No new package is added. Dynamic import keeps it out of SSR.
 *
 * Action data is built by the feature modules from ABIs verified on-chain
 * (token.worlds::stake/unstake, dao.worlds::votecust). Signing itself happens
 * in the user's WAX Cloud Wallet popup — this module never sees a key.
 */

export type AwAuth = { actor: string; permission: string }
export type AwAction = { account: string; name: string; authorization: AwAuth[]; data: Record<string, unknown> }

interface WaxLike {
  login(): Promise<string>
  api: {
    transact(
      tx: { actions: AwAction[] },
      opts: { blocksBehind: number; expireSeconds: number },
    ): Promise<{ transaction_id?: string }>
  }
}

const WAX_RPC = 'https://wax.greymass.com'
let wax: WaxLike | null = null
let account: string | null = null

export async function connectWax(): Promise<string | null> {
  const mod = await import('@waxio/waxjs/dist')
  const WaxJS = (mod as unknown as { WaxJS: new (o: { rpcEndpoint: string }) => WaxLike }).WaxJS
  wax = new WaxJS({ rpcEndpoint: WAX_RPC })
  const a = await wax.login()
  account = a || null
  return account
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
