'use client'

/**
 * Activity — recent token + NFT transfers for the loaded account, read from
 * Hyperion history via our /api/aw/wax-activity route. Read-only feed with
 * direction (received / sent), counterparty, amount and a link to the tx.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fmt } from '../lib/waxData'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

const EXPLORER = 'https://wax.bloks.io/transaction/'

type Act = {
  id: string; time: string; dir: 'in' | 'out' | 'self'; kind: 'token' | 'nft'
  contract: string; symbol: string; amount: number; counterparty: string; memo: string; nftCount: number
}

function ago(iso: string): string {
  const t = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()
  if (!t) return ''
  const secs = Math.max(0, (Date.now() - t) / 1000)
  const m = Math.floor(secs / 60), h = Math.floor(secs / 3600), d = Math.floor(secs / 86400)
  if (secs < 60) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(t).toLocaleDateString()
}

export default function Activity({ account }: FeatureProps) {
  const [acts, setActs] = useState<Act[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!account) { setActs(null); return }
    setLoading(true); setError('')
    fetch(`/api/aw/wax-activity?account=${encodeURIComponent(account)}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); setActs([]) } else setActs(d.activity || []) })
      .catch(() => setError('failed to load activity'))
      .finally(() => setLoading(false))
  }, [account])
  useEffect(load, [load])

  return (
    <>
      <PageHead title="Activity" desc="Recent Trilium, WAX, planet-token and NFT transfers on your account, live from the WAX chain." />
      <Card title="Recent transfers" tag="live read">
        {!account ? <Empty text="Enter your WAX account above and hit Load to see recent activity." />
          : loading && !acts ? <Empty text="Reading recent transfers…" />
          : error && (!acts || acts.length === 0) ? <p className={s.err}>⚠ {error === 'history unavailable' ? 'Transaction history is temporarily unavailable — try again shortly.' : error}</p>
          : !acts || acts.length === 0 ? <Empty text="No transfers found for this account yet." />
          : (
            <div className={s.actList}>
              {acts.map((a, i) => {
                const inbound = a.dir === 'in'
                const arrow = a.dir === 'self' ? '↺' : inbound ? '↓' : '↑'
                const color = a.dir === 'self' ? 'var(--aww-text-muted)' : inbound ? 'var(--aww-success)' : 'var(--aww-primary)'
                const label = a.dir === 'self' ? 'Self' : inbound ? 'Received' : 'Sent'
                const value = a.kind === 'nft' ? `${a.nftCount} NFT${a.nftCount === 1 ? '' : 's'}` : `${fmt(a.amount)} ${a.symbol}`
                return (
                  <a key={a.id + i} href={a.id ? EXPLORER + a.id : undefined} target="_blank" rel="noopener noreferrer" className={s.actRow}>
                    <span className={s.actIcon} style={{ color, borderColor: color }}>{arrow}</span>
                    <span className={s.actMid}>
                      <span className={s.actTop}>
                        <b>{label}</b> {inbound ? 'from' : a.dir === 'self' ? '·' : 'to'} <span className={s.actParty}>{a.counterparty}</span>
                      </span>
                      {a.memo && <span className={s.actMemo} title={a.memo}>“{a.memo}”</span>}
                    </span>
                    <span className={s.actRight}>
                      <span className={s.actVal} style={{ color }}>{a.dir === 'out' ? '−' : a.dir === 'in' ? '+' : ''}{value}</span>
                      <span className={s.actTime}>{ago(a.time)}</span>
                    </span>
                  </a>
                )
              })}
            </div>
          )}
        <p className={s.empty} style={{ marginTop: 12 }}>Showing the most recent transfers. Tap any row to view it on the WAX explorer.</p>
      </Card>
    </>
  )
}
