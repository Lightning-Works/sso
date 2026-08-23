'use client'

/**
 * Shine (Forge) — combine 4 identical tools + a small TLM fee into one tool of
 * the next shine tier. One column per tool you own 2+ of that has an active
 * s.federation shine recipe. Four slots per column: filled = a copy you own,
 * empty (on the right) = still needed. 4 filled → FORGE NOW; fewer → "N More
 * Needed" plus a buy link that opens the AtomicHub market for that exact tool,
 * cheapest first, in a new tab.
 */
import { useCallback, useEffect, useState } from 'react'
import { PageHead, Card, Empty } from '../ui/primitives'
import { fetchShineCandidates, fetchForgeAssetIds, buildForgeActions, type ShineCandidate } from '../lib/aw/shine'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import type { FeatureProps } from './ctx'

type Status = { msg: string; kind: 'working' | 'ok' | 'err' }
const PRIMARY = 'var(--aww-primary, #b06cff)'
const MUTED = 'var(--aww-text-muted, #9aa)'

export default function Shine({ account }: FeatureProps) {
  const [cands, setCands] = useState<ShineCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Record<number, Status>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!account) { setCands(null); return }
    setLoading(true)
    fetchShineCandidates(account).then(setCands).catch(() => setCands([])).finally(() => setLoading(false))
  }, [account])

  useEffect(load, [load])

  const setStat = (tid: number, s: Status | null) =>
    setStatus(p => { const n = { ...p }; if (s) n[tid] = s; else delete n[tid]; return n })

  const forge = async (c: ShineCandidate) => {
    if (busy != null) return
    setBusy(c.templateId)
    setStat(c.templateId, { msg: 'Preparing…', kind: 'working' })
    try {
      if (!currentAccount()) await connectWax()          // stay inside the click gesture
      const acct = currentAccount() || account
      const ids = await fetchForgeAssetIds(acct, c.templateId)
      if (ids.length < 4) throw new Error('Need 4 copies to forge — try reloading.')
      setStat(c.templateId, { msg: 'Confirm in your wallet…', kind: 'working' })
      const res = await transact(buildForgeActions(acct, ids, c.cost))
      const tx = String(res.transaction_id || '').slice(0, 8)
      setStat(c.templateId, { msg: `Forged into ${c.toShine}! ${tx ? `(tx ${tx}…)` : ''}`, kind: 'ok' })
      setTimeout(load, 4000)                              // refresh counts after the mint lands
    } catch (e) {
      setStat(c.templateId, { msg: e instanceof Error ? e.message : 'Forge failed', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead
        title="Shine — Forge Tools"
        desc={<>Combine <b style={{ color: 'var(--aww-text)' }}>4 identical tools</b> plus a small Trilium fee to forge one tool of the next shine tier — Stone → Gold → Stardust → Antimatter → XDimension — with better luck and faster mining. The 4 originals are used up.</>}
      />

      {!account ? (
        <Card tag="live read"><Empty text="Load or connect a WAX account to see what you can forge." /></Card>
      ) : loading && !cands ? (
        <Card tag="live read"><Empty text="Scanning your tools for forgeable sets…" /></Card>
      ) : !cands || cands.length === 0 ? (
        <Card tag="live read"><Empty text="No forgeable sets yet — you need 2 or more identical tools that can be shined up." /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {cands.map(c => (
            <Column key={c.templateId} c={c} status={status[c.templateId]} disabled={busy != null && busy !== c.templateId} onForge={() => forge(c)} />
          ))}
        </div>
      )}
    </>
  )
}

function Column({ c, status, disabled, onForge }: { c: ShineCandidate; status?: Status; disabled: boolean; onForge: () => void }) {
  const filled = Math.min(c.count, 4)
  const working = status?.kind === 'working'
  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--aww-text)', lineHeight: 1.2 }} title={c.name}>{c.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
          {c.rarity ? `${c.rarity} · ` : ''}{c.shine || 'Stone'} <span style={{ color: PRIMARY }}>→ {c.toShine}</span>
        </div>
      </div>

      {/* four slots — filled left, missing on the right */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '12px 0' }}>
        {[0, 1, 2, 3].map(i => {
          const has = i < filled
          return (
            <div key={i} style={{
              width: 50, height: 50, borderRadius: 8, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: has ? `1px solid ${PRIMARY}` : '1px dashed color-mix(in srgb, var(--aww-text-muted) 45%, transparent)',
              background: has ? 'transparent' : 'color-mix(in srgb, var(--aww-text-muted) 8%, transparent)',
              boxShadow: has ? `0 0 8px color-mix(in srgb, ${PRIMARY} 40%, transparent)` : 'none',
            }}>
              {has && c.img
                ? <img src={c.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 20, color: 'color-mix(in srgb, var(--aww-text-muted) 55%, transparent)' }}>{has ? '' : '+'}</span>}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        {c.ready ? (
          <>
            <button
              onClick={onForge}
              disabled={disabled || working}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', cursor: disabled || working ? 'default' : 'pointer',
                fontWeight: 800, fontSize: 14, letterSpacing: 0.3, color: '#fff',
                background: disabled || working ? 'color-mix(in srgb, var(--aww-text-muted) 30%, transparent)' : `linear-gradient(135deg, ${PRIMARY}, color-mix(in srgb, ${PRIMARY} 60%, #4be1c2))`,
                boxShadow: disabled || working ? 'none' : `0 0 14px color-mix(in srgb, ${PRIMARY} 55%, transparent)`,
              }}
            >
              {working ? 'Working…' : 'FORGE NOW!'}
            </button>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Fee: {c.costTlm} $TLM</div>
          </>
        ) : (
          <>
            <div style={{
              padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
              color: 'color-mix(in srgb, var(--aww-text-muted) 45%, #fff)',
              background: 'color-mix(in srgb, var(--aww-text-muted) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)',
            }}>
              {c.needed} More Needed
            </div>
            <a href={c.marketUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: PRIMARY, textDecoration: 'none' }}>
              Buy more — cheapest first ↗
            </a>
          </>
        )}

        {status && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.35, color: status.kind === 'err' ? '#ff6b6b' : status.kind === 'ok' ? '#4be1c2' : MUTED }}>
            {status.msg}
          </div>
        )}
      </div>
    </Card>
  )
}
