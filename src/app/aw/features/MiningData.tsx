'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import { BarList, ColumnChart, Scatter } from '../ui/charts'
import s from '../aw.module.css'

type Summary = {
  ready: boolean; hint?: string
  counts?: { snapshots: number; mineEvents: number; nftDrops: number; ips: number; teams: number }
  lastRun?: string | null
}
type Analytics = {
  ready: boolean
  overview?: { miners: number; avg_luck: number; avg_delay: number }
  luck_hist?: { b: number; c: number }[]
  delay_hist?: { b: number; c: number }[]
  tool_count?: { n: number; c: number }[]
  shine?: { k: string; c: number }[]
  rarity?: { k: string; c: number }[]
  top_tools?: { k: string; c: number }[]
  top_miners?: { miner: string; luck: number; delay: number; score: number; tools: number }[]
  scatter?: { l: number; d: number; c: number; n: number }[]
  over_time?: { day: string; c: number }[]
}

export default function MiningData() {
  const [sum, setSum] = useState<Summary | null>(null)
  const [an, setAn] = useState<Analytics | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try { setSum(await (await fetch('/api/aw/admin/mining/summary', { cache: 'no-store' })).json()) } catch { setSum({ ready: false }) }
    try { setAn(await (await fetch('/api/aw/admin/mining/analytics', { cache: 'no-store' })).json()) } catch { setAn(null) }
  }, [])
  useEffect(() => { load() }, [load])

  const runSnapshot = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/aw/admin/mining/snapshot', { method: 'POST' })
      const j = await r.json()
      setMsg(r.ok ? `Scanned ${j.scanned} · active ${j.active} · snapshotted ${j.snapshotted}` : (j.error || `HTTP ${r.status}`))
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'failed') }
    finally { setBusy(false) }
  }

  const dayShort = (d: string) => d.slice(5) // MM-DD

  return (
    <div>
      <PageHead title="Mining Data" desc="Superadmin analytics — collect on-chain mining data, study what works, spot bots, and rank the syndicate teams." />

      {!sum ? <Card><Empty text="Loading…" /></Card> : !sum.ready ? (
        <Card title="Set up required" tag="one-time">
          <p className={s.empty}>{sum.hint || 'Run docs/mining_data_schema.sql in Supabase, then reload.'}</p>
        </Card>
      ) : (
        <>
          <Card title="Collection status" tag="live">
            <Grid>
              <Stat label="Loadout snapshots" value={String(sum.counts?.snapshots ?? 0)} />
              <Stat label="Unique miners" value={String(an?.overview?.miners ?? '—')} />
              <Stat label="Avg total luck" value={String(an?.overview?.avg_luck ?? '—')} />
              <Stat label="Avg total delay" value={`${an?.overview?.avg_delay ?? '—'}s`} />
              <Stat label="Visitor IPs" value={String(sum.counts?.ips ?? 0)} />
            </Grid>
            <p className={s.empty} style={{ marginTop: 10 }}>Last run: {sum.lastRun ? new Date(sum.lastRun).toLocaleString() : 'never'}. Auto-collects every 10 min via cron.</p>
            <div className={s.stubActions} style={{ marginTop: 10 }}>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={runSnapshot} disabled={busy}>{busy ? 'Collecting…' : 'Run snapshot now'}</button>
            </div>
            {msg && <p className={s.ok} style={{ marginTop: 10 }}>{msg}</p>}
          </Card>

          {an?.ready && (an.overview?.miners ?? 0) > 0 ? (
            <>
              <Card title="Loadout efficiency — luck vs delay" tag="bubble = # of miners">
                <p className={s.empty} style={{ marginBottom: 8 }}>Up-and-left is more efficient (more luck per second). Bubble size = how many miners run that exact build; color = tools equipped (bright = 3). Only ~{(an.scatter || []).length} distinct builds exist — the active population clusters hard on a few meta loadouts.</p>
                <Scatter points={(an.scatter || []).map(p => ({ x: p.d, y: p.l, c: p.c, n: p.n }))} xLabel="total delay (s)" yLabel="total luck" />
              </Card>

              <div className={s.chartRow}>
                <Card title="Total luck distribution" tag="miners"><ColumnChart data={(an.luck_hist || []).map(d => ({ label: String(d.b), value: d.c }))} /></Card>
                <Card title="Total delay distribution (s)" tag="miners"><ColumnChart data={(an.delay_hist || []).map(d => ({ label: String(d.b), value: d.c }))} /></Card>
              </div>

              <div className={s.chartRow}>
                <Card title="Tools equipped" tag="miners"><BarList data={(an.tool_count || []).map(d => ({ label: `${d.n} tool${d.n === 1 ? '' : 's'}`, value: d.c }))} /></Card>
                <Card title="Shine tiers" tag="tools"><BarList data={(an.shine || []).map(d => ({ label: d.k, value: d.c }))} /></Card>
              </div>

              <div className={s.chartRow}>
                <Card title="Rarity mix" tag="tools"><BarList data={(an.rarity || []).map(d => ({ label: d.k, value: d.c }))} /></Card>
                <Card title="Most popular tools" tag="top 15"><BarList data={(an.top_tools || []).map(d => ({ label: d.k, value: d.c }))} /></Card>
              </div>

              <Card title="Snapshots collected per day" tag="14 days">
                <ColumnChart data={(an.over_time || []).map(d => ({ label: dayShort(d.day), value: d.c }))} />
              </Card>

              <Card title="Top miners by efficiency (luck ÷ delay)" tag="leaderboard">
                <div className={s.list}>
                  {(an.top_miners || []).map((m, i) => (
                    <div key={m.miner} className={s.listRow}>
                      <span>{i + 1}</span>
                      <b>{m.miner}</b>
                      <span className={s.listMeta}>score {m.score} · luck {m.luck} · delay {m.delay}s · {m.tools} tools</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card title="Charts" tag="waiting"><Empty text="Charts appear once snapshots are collected — hit 'Run snapshot now' or wait for the cron." /></Card>
          )}
        </>
      )}
    </div>
  )
}
