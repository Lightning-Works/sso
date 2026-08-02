'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Grid, Stat, Empty, PageHead } from '../ui/primitives'
import s from '../aw.module.css'

type Summary = {
  ready: boolean
  hint?: string
  counts?: { snapshots: number; mineEvents: number; nftDrops: number; ips: number; teams: number }
  cursor?: { next?: string } | null
  lastRun?: string | null
  recent?: { miner: string; planet: string | null; total_luck: number; total_delay: number; tool_ids: string[]; captured_at: string }[]
}

const ROADMAP: { title: string; lines: string[] }[] = [
  { title: 'Miner leaderboard', lines: ['Who mines most, TLM & NFTs earned, mines/hour, by planet.'] },
  { title: 'TLM/hr model', lines: ['Regression of real rewards on luck, delay, planet & commission — replaces the theoretical rule with measured numbers.'] },
  { title: 'NFT drop rates', lines: ['Measured drop rate per unit of luck, per planet & shine tier.'] },
  { title: 'Bot / Sybil detection', lines: ['Clock-precise cadence, identical loadouts, shared cash-out wallets, batch-created accounts, shared IPs.'] },
  { title: 'Node map', lines: ['Geo map of AWW users from logged IPs (chain has none).'] },
  { title: 'Syndicate team rankings', lines: ['The 5 elected custodians per planet as teams, scored against each other.'] },
]

export default function MiningData() {
  const [sum, setSum] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try { setSum(await (await fetch('/api/aw/admin/mining/summary', { cache: 'no-store' })).json()) }
    catch { setSum({ ready: false, hint: 'Could not reach the summary API.' }) }
  }, [])
  useEffect(() => { load() }, [load])

  const runSnapshot = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/aw/admin/mining/snapshot', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) setMsg(j.error || `HTTP ${r.status}`)
      else { setMsg(`Scanned ${j.scanned} · active ${j.active} · snapshotted ${j.snapshotted}${j.wrapped ? ' · reached end, cursor reset' : ''}`); load() }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'snapshot failed') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageHead title="Mining Data" desc="Superadmin analytics — collect on-chain mining data, study what works, spot bots, and rank the syndicate teams." />

      {!sum ? <Card><Empty text="Loading…" /></Card> : !sum.ready ? (
        <Card title="Set up required" tag="one-time">
          <p className={s.empty} style={{ marginBottom: 10 }}>{sum.hint || 'The analytics tables are not created yet.'}</p>
          <p className={s.empty}>Run <b>docs/mining_data_schema.sql</b> in the Supabase SQL editor, then reload this page.</p>
        </Card>
      ) : (
        <>
          <Card title="Collection status" tag="live">
            <Grid>
              <Stat label="Loadout snapshots" value={String(sum.counts?.snapshots ?? 0)} />
              <Stat label="Mine events" value={String(sum.counts?.mineEvents ?? 0)} />
              <Stat label="NFT drops" value={String(sum.counts?.nftDrops ?? 0)} />
              <Stat label="Visitor IPs" value={String(sum.counts?.ips ?? 0)} />
              <Stat label="Team snapshots" value={String(sum.counts?.teams ?? 0)} />
            </Grid>
            <p className={s.empty} style={{ marginTop: 10 }}>
              Last run: {sum.lastRun ? new Date(sum.lastRun).toLocaleString() : 'never'}. The collector walks the miner table one page per run; wire a cron to run it continuously.
            </p>
            <div className={s.stubActions} style={{ marginTop: 10 }}>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={runSnapshot} disabled={busy}>{busy ? 'Collecting…' : 'Run snapshot (one page)'}</button>
            </div>
            {msg && <p className={s.ok} style={{ marginTop: 10 }}>{msg}</p>}
          </Card>

          <Card title="Recent loadout snapshots" tag="live read">
            {!sum.recent || sum.recent.length === 0 ? <Empty text="No snapshots yet — run the collector." /> : (
              <div className={s.list}>
                {sum.recent.map((r, i) => (
                  <div key={i} className={s.listRow}>
                    <span>{i + 1}</span>
                    <b>{r.miner}</b>
                    <span className={s.listMeta}>{r.tool_ids?.length || 0} tools · luck {r.total_luck} · delay {r.total_delay}s · {new Date(r.captured_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Analytics roadmap" tag="plan">
        <p className={s.empty} style={{ marginBottom: 12 }}>Built next, once data is flowing. See docs/MINING_DATA.md for the full design.</p>
        <Grid>
          {ROADMAP.map(r => <Stat key={r.title} label={r.title} value="planned" sub={r.lines[0]} />)}
        </Grid>
      </Card>
    </div>
  )
}
