/**
 * WAX account resources for the Staking panel.
 *
 * Reads the live get_account record straight from the public WAX RPC (same
 * endpoint the syndicate holdings use) and normalises the bits the Staking
 * UI needs: liquid WAX, self-staked CPU/NET, CPU/NET/RAM usage, the pending
 * 72h refund, and the current vote (proxy or producers).
 *
 * All on-chain resource staking is done through the base system contract
 * `eosio` (delegatebw / undelegatebw / voteproducer / claimgbmvote) — verified
 * current on WAX as of 2026 (PowerUp is only a pay-per-tx fallback; staking
 * still grants CPU/NET and voter rewards).
 */
const RPC = 'https://wax.greymass.com'

export type WaxResources = {
  account: string
  liquidWax: number
  cpuStaked: number   // WAX self-delegated to CPU
  netStaked: number   // WAX self-delegated to NET
  cpuUsed: number     // microseconds
  cpuMax: number
  netUsed: number     // bytes
  netMax: number
  ramUsed: number     // bytes
  ramQuota: number
  refundCpu: number
  refundNet: number
  refundAt: number | null   // epoch ms when the 72h refund is claimable
  proxy: string       // '' if none
  producers: string[]
  hasVote: boolean
}

const num = (asset: unknown): number => parseFloat(String(asset ?? '').split(' ')[0]) || 0

export async function fetchWaxResources(account: string): Promise<WaxResources> {
  const r = await fetch(`${RPC}/v1/chain/get_account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name: account }),
  })
  if (!r.ok) throw new Error(`account read failed (${r.status})`)
  const d = await r.json()

  const self = d.self_delegated_bandwidth || {}
  const refund = d.refund_request || null
  const voter = d.voter_info || null

  let refundAt: number | null = null
  if (refund?.request_time) {
    // request_time is UTC without a zone suffix; add 72h to get availability.
    const t = Date.parse(`${refund.request_time}Z`)
    if (!Number.isNaN(t)) refundAt = t + 72 * 3600 * 1000
  }

  return {
    account,
    liquidWax: num(d.core_liquid_balance),
    cpuStaked: num(self.cpu_weight),
    netStaked: num(self.net_weight),
    cpuUsed: d.cpu_limit?.used ?? 0,
    cpuMax: d.cpu_limit?.max ?? 0,
    netUsed: d.net_limit?.used ?? 0,
    netMax: d.net_limit?.max ?? 0,
    ramUsed: d.ram_usage ?? 0,
    ramQuota: d.ram_quota ?? 0,
    refundCpu: num(refund?.cpu_amount),
    refundNet: num(refund?.net_amount),
    refundAt,
    proxy: voter?.proxy || '',
    producers: Array.isArray(voter?.producers) ? voter.producers : [],
    hasVote: !!(voter?.proxy || (voter?.producers?.length ?? 0) >= 16),
  }
}

/** WAX assets must carry 8 decimals in delegatebw/undelegatebw quantities. */
export const waxAsset = (amount: number): string => `${amount.toFixed(8)} WAX`
