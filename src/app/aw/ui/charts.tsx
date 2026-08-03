'use client'

/**
 * Tiny dependency-free charts for the Mining Data dashboard — themed to the AWW
 * palette. Horizontal bar list, vertical column chart, and an SVG scatter.
 */

const PURPLE = 'color-mix(in srgb, var(--aww-primary, #8b5cf6) 78%, #fff)'
const DIM = 'var(--aww-text-dim, #9aa)'

export function BarList({ data, unit = '' }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '38% 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--aww-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
          <span style={{ height: 12, background: 'color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(d.value / max) * 100}%`, background: PURPLE, borderRadius: 4 }} />
          </span>
          <b style={{ color: DIM, minWidth: 34, textAlign: 'right' }}>{d.value.toLocaleString()}{unit}</b>
        </div>
      ))}
    </div>
  )
}

export function ColumnChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 9, color: DIM }}>{d.value}</span>
          <div title={`${d.label}: ${d.value}`} style={{ width: '100%', height: `${(d.value / max) * 100}%`, minHeight: 2, background: PURPLE, borderRadius: '3px 3px 0 0' }} />
          <span style={{ fontSize: 9, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Mining chart: TLM earned per time bucket, scaled to fill the width ----
export type Bucket = 'hour' | 'day' | 'week'
const BUCKET_MS: Record<Bucket, number> = { hour: 3600000, day: 86400000, week: 604800000 }

/** Pick a bucket that fits all the data nicely (the "all time" default). */
export function autoBucket(events: { ts: number }[]): Bucket {
  if (!events.length) return 'hour'
  const span = Date.now() - Math.min(...events.map(e => e.ts))
  if (span < 2 * 86400000) return 'hour'
  if (span < 45 * 86400000) return 'day'
  return 'week'
}

export function MiningChart({ events, bucket }: { events: { ts: number; reward: number }[]; bucket: Bucket }) {
  const size = BUCKET_MS[bucket]
  const now = Date.now()
  let start = events.length ? Math.min(...events.map(e => e.ts)) : now
  // Few mines: spread them across a wider window so they aren't jammed on one edge.
  if (events.length < 10) start = Math.min(start, now - (bucket === 'hour' ? 86400000 : bucket === 'day' ? 7 * 86400000 : 8 * 604800000))
  start = Math.floor(start / size) * size
  const MAX_BARS = 72
  if ((now - start) / size > MAX_BARS) start = Math.floor((now - MAX_BARS * size) / size) * size

  const map = new Map<number, number>()
  for (const e of events) { const b = Math.floor(e.ts / size) * size; if (b >= start) map.set(b, (map.get(b) || 0) + e.reward) }
  const bars: { t: number; v: number }[] = []
  for (let t = start; t <= now; t += size) bars.push({ t, v: map.get(t) || 0 })

  const max = Math.max(0.00001, ...bars.map(b => b.v))
  const n = bars.length
  const gap = n > 40 ? 1 : n > 20 ? 2 : 4
  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const fmt = (t: number) => bucket === 'hour'
    ? new Date(t).toLocaleTimeString([], { hour: 'numeric' })
    : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>Peak {max.toFixed(4)} $TLM per {bucket}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: 160 }}>
        {bars.map((b, i) => (
          <div key={i} title={`${new Date(b.t).toLocaleString()} — ${b.v.toFixed(4)} TLM`} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: '100%', height: `${(b.v / max) * 100}%`, minHeight: b.v > 0 ? 3 : 0, background: b.v > 0 ? PURPLE : 'transparent', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap, marginTop: 4 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden' }}>{i % labelEvery === 0 ? fmt(b.t) : ''}</div>
        ))}
      </div>
    </div>
  )
}

export function Scatter({ points, xLabel, yLabel }: { points: { x: number; y: number; c?: number; n?: number }[]; xLabel: string; yLabel: string }) {
  const W = 640, H = 320, pad = 40
  const xMax = Math.max(1, ...points.map(p => p.x)), yMax = Math.max(1, ...points.map(p => p.y))
  const cMax = Math.max(1, ...points.map(p => p.c ?? 1))
  const px = (x: number) => pad + (x / xMax) * (W - pad - 10)
  const py = (y: number) => H - pad - (y / yMax) * (H - pad - 10)
  const r = (c?: number) => 3 + Math.sqrt((c ?? 1) / cMax) * 20
  const dot = (n?: number) => (n === 3 ? PURPLE : n === 1 ? 'color-mix(in srgb, var(--aww-primary) 45%, #fff)' : DIM)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
      <line x1={pad} y1={H - pad} x2={W - 10} y2={H - pad} stroke="var(--aww-border,#333)" />
      <line x1={pad} y1={8} x2={pad} y2={H - pad} stroke="var(--aww-border,#333)" />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r={r(p.c)} fill={dot(p.n)} opacity={0.55} stroke={PURPLE} strokeOpacity={0.5} strokeWidth={0.5} />
      ))}
      <text x={W / 2} y={H - 6} fill={DIM} fontSize="11" textAnchor="middle">{xLabel} →</text>
      <text x={13} y={H / 2} fill={DIM} fontSize="11" textAnchor="middle" transform={`rotate(-90 13 ${H / 2})`}>{yLabel} →</text>
    </svg>
  )
}
