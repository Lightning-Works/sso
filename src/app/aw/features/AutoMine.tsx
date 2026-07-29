'use client'

import { useSyncExternalStore } from 'react'
import s from '../aw.module.css'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { subscribe, getState, startDemo, stop } from '../lib/aw/mining'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function AutoMine({ account }: FeatureProps) {
  const m = useSyncExternalStore(subscribe, getState, getState)
  const prices = usePrices()
  const usdSub = (amount: number) => {
    const v = usdFor('TLM', amount, prices)
    return v == null ? undefined : fmtUsd(v)
  }

  return (
    <>
      <PageHead title="Auto-Mine" desc="Keep mining automatically — no clicking, no time lost. Rewards are tracked over time." />

      <Card title="Auto-miner" tag={m.running ? 'running' : 'idle'}>
        {!account ? <Empty text="Load or connect a WAX account to begin." /> : (
          <>
            {m.lastMessage && <div className={s.msg}>{m.running ? '⛏️ ' : ''}{m.lastMessage}</div>}
            <div className={s.stubActions}>
              {!m.running
                ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => startDemo(account)}>Start auto-mining</button>
                : <button className={`${s.btn} ${s.btnGhost}`} onClick={stop}>Stop</button>}
            </div>
            <p className={s.empty} style={{ marginTop: 10 }}>
              Preview runs in <b>demo mode</b> (simulated mines) so you can see the tracking + messages. The live build equips a Land + up to 3 tools and runs the real cycle: wait cooldown → proof-of-work → mine → claim.
            </p>
          </>
        )}
      </Card>

      {account && (
        <>
          <Card title="Rewards tracker" tag="tracked over time">
            <Grid>
              <Stat label="This session" value={`${m.sessionTlm.toFixed(4)} TLM`} sub={usdSub(m.sessionTlm)} />
              <Stat label="All-time (this device)" value={`${m.allTimeTlm.toFixed(4)} TLM`} sub={usdSub(m.allTimeTlm)} />
              <Stat label="Rate" value={`${m.ratePerHr.toFixed(2)} TLM/hr`} />
              <Stat label="Mines logged" value={`${m.events.length}`} />
            </Grid>
          </Card>

          <Card title="Recent mines" tag="log">
            {m.events.length === 0 ? <Empty text="No mines yet — start the auto-miner." /> : (
              <div className={s.list}>
                {[...m.events].reverse().slice(0, 15).map((e, i) => (
                  <div key={i} className={s.logRow}>
                    <span>{time(e.ts)}</span>
                    <b>+{e.amount.toFixed(4)} TLM</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}
