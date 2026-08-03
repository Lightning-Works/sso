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

export function Scatter({ points, xLabel, yLabel }: { points: { x: number; y: number; n?: number }[]; xLabel: string; yLabel: string }) {
  const W = 480, H = 260, pad = 34
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const xMax = Math.max(1, ...xs), yMax = Math.max(1, ...ys)
  const px = (x: number) => pad + (x / xMax) * (W - pad - 8)
  const py = (y: number) => H - pad - (y / yMax) * (H - pad - 8)
  const dot = (n?: number) => (n === 3 ? PURPLE : n === 1 ? 'color-mix(in srgb, var(--aww-primary) 45%, #fff)' : DIM)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
      <line x1={pad} y1={H - pad} x2={W - 8} y2={H - pad} stroke="var(--aww-border,#333)" />
      <line x1={pad} y1={8} x2={pad} y2={H - pad} stroke="var(--aww-border,#333)" />
      {points.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={2.5} fill={dot(p.n)} opacity={0.7} />)}
      <text x={(W) / 2} y={H - 4} fill={DIM} fontSize="10" textAnchor="middle">{xLabel} →</text>
      <text x={12} y={H / 2} fill={DIM} fontSize="10" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{yLabel} →</text>
    </svg>
  )
}
