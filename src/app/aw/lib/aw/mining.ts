/**
 * Auto-mining engine + rewards tracker.
 *
 * A module-level singleton so auto-mining keeps running as the user navigates
 * between wallet sections (no time lost). Tracks mined TLM over time — session
 * total, all-time total (persisted per account, like staking history) and a log
 * of mine events — and surfaces an in-wallet message on each mine.
 *
 * PREVIEW: runs in DEMO mode (simulated mines) so the tracking + messaging UX is
 * visible. In the build, `startReal()` will run the true cycle:
 *   wait(bag delay) → compute proof-of-work → m.federation::mine → claimmines.
 */

export type MineEvent = { ts: number; amount: number }
export type MineState = {
  running: boolean
  demo: boolean
  account: string | null
  sessionTlm: number
  allTimeTlm: number
  ratePerHr: number
  events: MineEvent[]
  lastMessage: string
}

let state: MineState = {
  running: false, demo: false, account: null,
  sessionTlm: 0, allTimeTlm: 0, ratePerHr: 0, events: [], lastMessage: '',
}
let sessionStart = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

const emit = () => { listeners.forEach(l => l()) }
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getState = (): MineState => state

const key = (a: string) => `aww-mining-${a}`
function persist() {
  if (!state.account) return
  try { localStorage.setItem(key(state.account), JSON.stringify({ allTimeTlm: state.allTimeTlm, events: state.events.slice(-50) })) } catch { /* ignore */ }
}

export function loadFor(account: string) {
  let allTimeTlm = 0, events: MineEvent[] = []
  try {
    const raw = localStorage.getItem(key(account))
    if (raw) { const d = JSON.parse(raw); allTimeTlm = d.allTimeTlm || 0; events = d.events || [] }
  } catch { /* ignore */ }
  state = { ...state, account, allTimeTlm, events }
  emit()
}

function recordMine(amount: number) {
  const now = Date.now()
  const events = [...state.events, { ts: now, amount }].slice(-50)
  const sessionTlm = state.sessionTlm + amount
  const hrs = Math.max((now - sessionStart) / 3_600_000, 1 / 3600)
  state = {
    ...state,
    sessionTlm,
    allTimeTlm: state.allTimeTlm + amount,
    ratePerHr: sessionTlm / hrs,
    events,
    lastMessage: `Mined ${amount.toFixed(4)} TLM — claimed to your wallet`,
  }
  persist()
  emit()
}

/** Start auto-mining in DEMO mode (simulated mines to preview the UX). */
export function startDemo(account: string) {
  if (state.running) return
  loadFor(account)
  sessionStart = Date.now()
  state = { ...state, running: true, demo: true, sessionTlm: 0, ratePerHr: 0, lastMessage: 'Auto-mining started (demo)' }
  emit()
  timer = setInterval(() => recordMine(0.05 + Math.random() * 0.3), 4000)
}

export function stop() {
  if (timer) { clearInterval(timer); timer = null }
  state = { ...state, running: false, lastMessage: state.running ? 'Auto-mining stopped' : state.lastMessage }
  emit()
}
