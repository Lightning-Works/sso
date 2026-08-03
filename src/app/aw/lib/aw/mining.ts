/**
 * Real auto-mining engine + rewards tracker (module singleton so it keeps
 * running as the user navigates).
 *
 * Cycle: read the miner's current last-mine tx (the PoW seed) → solve the
 * proof-of-work nonce (pow.ts, verified against real mines) → sign
 * m.federation::mine via the WharfKit/MyCloudWallet session → wait the loadout
 * cooldown → repeat. Earned TLM is measured from the real on-chain balance
 * delta, so the numbers shown are actual, verifiable rewards (not simulated).
 */
import { solvePow, POW_OK } from './pow'
import { signMineWithKey } from './miningKey'
import type { AwAction } from '../wax/session'

const RPC = 'https://wax.greymass.com'
type Submit = (actions: AwAction[]) => Promise<{ transaction_id?: string }>

export type MineEvent = { ts: number; tx: string; reward: number }
export type MineState = {
  running: boolean
  account: string | null
  mines: number
  sessionTlm: number
  ratePerHr: number
  status: string
  message: string
  lastReward: number      // TLM from the most recent mine
  nextMineAt: number | null // epoch ms when the next mine is allowed (for the countdown)
  events: MineEvent[]
  powOk: boolean
}

let state: MineState = {
  running: false, account: null, mines: 0, sessionTlm: 0, ratePerHr: 0,
  status: 'idle', message: '', lastReward: 0, nextMineAt: null, events: [], powOk: POW_OK,
}
let sessionStart = 0
let startTlm = 0
let stopFlag = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getState = (): MineState => state
const set = (p: Partial<MineState>) => { state = { ...state, ...p }; emit() }

async function rows(code: string, table: string, scope: string, bound?: string) {
  const body: Record<string, unknown> = { code, table, scope, json: true, limit: 1 }
  if (bound) { body.lower_bound = bound; body.upper_bound = bound }
  const r = await fetch(`${RPC}/v1/chain/get_table_rows`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
  const d = await r.json()
  return d.rows || []
}

/** Seed (current last-mine tx) + the loadout cooldown in seconds. */
async function readSeedAndCooldown(account: string): Promise<{ seed: string; cooldown: number }> {
  const [miner, bag] = await Promise.all([
    rows('m.federation', 'miners', 'm.federation', account),
    rows('m.federation', 'bags', 'm.federation', account),
  ])
  const seed = String(miner[0]?.last_mine_tx || '')
  const items: string[] = (bag[0]?.items as string[]) || []
  let totalDelay = 0
  if (items.length) {
    const r = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?ids=${items.join(',')}&limit=10`)
    if (r.ok) { const d = await r.json(); for (const a of d.data || []) { const im = { ...(a.template?.immutable_data || {}), ...(a.data || {}) }; totalDelay += Number(im.delay) || 0 } }
  }
  return { seed, cooldown: Math.max(Math.round(totalDelay * 0.8), 30) }
}

async function readTlm(account: string): Promise<number> {
  const r = await rows('alien.worlds', 'accounts', account)
  for (const row of r) { const [amt, sym] = String(row.balance || '').split(' '); if (sym === 'TLM') return parseFloat(amt) || 0 }
  return 0
}

const mineAction = (account: string, nonce: string): AwAction => ({
  account: 'm.federation', name: 'mine', authorization: [{ actor: account, permission: 'active' }], data: { miner: account, nonce },
})

/**
 * Step 1: read the seed and solve the PoW (async — no signing yet). Returned so
 * the caller can sign in a FRESH user gesture, otherwise the Cloud Wallet popup
 * is blocked.
 */
export async function solveMine(account: string): Promise<{ nonce: string; cooldown: number }> {
  if (!POW_OK) throw new Error('PoW self-test failed in this browser')
  set({ status: 'mining', message: 'Mining now…' })
  let seed = '', cooldown = 60
  try {
    const r = await readSeedAndCooldown(account); seed = r.seed; cooldown = r.cooldown
  } catch (e) {
    throw new Error(`Could not read your account from the chain (network/CORS): ${e instanceof Error ? e.message : 'fetch failed'}`)
  }
  if (!seed) throw new Error('No last-mine seed found — has this account ever mined?')
  const nonce = await solvePow(account, seed, 20)
  set({ status: 'ready', message: 'Ready — press Confirm to mine.' })
  return { nonce, cooldown }
}

/** Step 2: sign + broadcast the mine (call this inside a click gesture). */
export async function submitMine(account: string, nonce: string, submit: Submit): Promise<string> {
  set({ status: 'mining', message: 'Mining now…' })
  try {
    const r = await submit([mineAction(account, nonce)])
    set({ status: 'idle', message: '' })
    return r.transaction_id || 'sent'
  } catch (e) {
    throw new Error(`Signing/broadcast failed: ${e instanceof Error ? e.message : 'error'}`)
  }
}

const key = (a: string) => `aww-mining-${a}`
function persist() {
  if (!state.account) return
  try { localStorage.setItem(key(state.account), JSON.stringify({ mines: state.mines, events: state.events.slice(-50) })) } catch { /* ignore */ }
}
export function loadFor(account: string) {
  let mines = 0, events: MineEvent[] = []
  try { const raw = localStorage.getItem(key(account)); if (raw) { const d = JSON.parse(raw); mines = d.mines || 0; events = d.events || [] } } catch { /* ignore */ }
  state = { ...state, account, mines, events }
  emit()
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
async function waitStoppable(ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end && !stopFlag) await wait(500)
}

/**
 * Start the continuous hands-free mining loop, signing each mine with the LOCAL
 * mining key (no wallet popup). Requires the mine permission to be set up first.
 */
export async function startReal(account: string) {
  if (state.running) return
  stopFlag = false
  sessionStart = Date.now()
  startTlm = await readTlm(account).catch(() => 0)
  set({ running: true, account, status: 'running', message: 'Auto-mining started', sessionTlm: 0 })

  while (!stopFlag) {
    try {
      const { seed, cooldown } = await readSeedAndCooldown(account)
      if (!seed) throw new Error('no seed')
      set({ status: 'mining', message: 'Mining now…' })
      const nonce = await solvePow(account, seed, 20)
      if (stopFlag) break
      set({ status: 'mining', message: 'Mining now…' })
      const tx = await signMineWithKey(account, nonce)
      await wait(3000) // let the reward transfer land
      const bal = await readTlm(account).catch(() => startTlm + state.sessionTlm)
      const sessionTlm = Math.max(0, bal - startTlm)
      const reward = Math.max(0, sessionTlm - state.sessionTlm)
      const mines = state.mines + 1
      const hrs = Math.max((Date.now() - sessionStart) / 3_600_000, 1 / 3600)
      set({
        mines, sessionTlm, ratePerHr: sessionTlm / hrs, status: 'cooldown',
        lastReward: reward, nextMineAt: Date.now() + cooldown * 1000, message: '',
        events: [...state.events, { ts: Date.now(), tx, reward }].slice(-50),
      })
      persist()
      await waitStoppable(cooldown * 1000)
    } catch (e) {
      set({ status: 'error', message: `Mine failed: ${e instanceof Error ? e.message : 'error'} — retrying in 30s` })
      await waitStoppable(30000)
    }
  }
  set({ running: false, status: 'idle', message: 'Auto-mining stopped' })
}

export function stop() { stopFlag = true }
