'use client'

/**
 * Shine (Forge) — combine 4 identical tools + a small TLM fee into one tool of
 * the next shine tier. One column per tool you own 2+ of that has an active
 * s.federation shine recipe. Four slots per column: filled = a copy you own,
 * empty (on the right) = still needed. 4 filled → FORGE NOW; fewer → "N More
 * Needed" plus a buy link that opens the AtomicHub market for that exact tool,
 * cheapest first, in a new tab.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHead, Card, Empty } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { fetchShineCandidates, fetchForgeAssetIds, buildForgeActions, type ShineCandidate } from '../lib/aw/shine'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import type { NftItem } from '@/components/NftGrid'
import type { FeatureProps } from './ctx'

type Status = { msg: string; kind: 'working' | 'ok' | 'err' }
const PRIMARY = 'var(--aww-primary, #b06cff)'
const MUTED = 'var(--aww-text-muted, #9aa)'
// 50% lighter than the theme purple so link text stays readable on the dark card.
const LINK = 'color-mix(in srgb, var(--aww-primary, #b06cff) 50%, #fff)'

// Each shine tier drawn in its own colour (Gold reads gold, not purple).
const SHINE_COLORS: Record<string, string> = {
  stone: '#cfcfcf', gold: '#ffd24a', stardust: '#7fe0ff', antimatter: '#d59bff', xdimension: '#5affc8',
}
const shineColor = (name: string) => SHINE_COLORS[(name || '').toLowerCase()] || LINK

export default function Shine({ account, navigate }: FeatureProps) {
  const [cands, setCands] = useState<ShineCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Record<number, Status>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const { fetchThumbs, applyThumbs } = useThumbnails()

  const load = useCallback(() => {
    if (!account) { setCands(null); return }
    setLoading(true)
    fetchShineCandidates(account).then(setCands).catch(() => setCands([])).finally(() => setLoading(false))
  }, [account])

  useEffect(load, [load])

  // Pull cached webp thumbnails via the SSO proxy (same as the NFT inventory),
  // so slot art loads reliably instead of hammering a public gateway.
  const items = useMemo<NftItem[]>(
    () => (cands || []).map(c => ({ id: String(c.templateId), name: c.name, imageUrl: c.img, chain: 'WAX', collection: 'Alien Worlds' })),
    [cands],
  )
  useEffect(() => { if (account && items.length) fetchThumbs(items, account) }, [account, items, fetchThumbs])
  const imgByTid = useMemo(() => {
    const map: Record<number, string | null> = {}
    for (const it of applyThumbs(items)) map[Number(it.id)] = it.thumbUrl || it.imageUrl
    return map
  }, [items, applyThumbs])

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

  // Open OUR Market, pre-filtered to the tool they still need — SPA switch, then
  // stamp the ?template smart URL so Market shows just that tool, cheapest first.
  const goBuy = (c: ShineCandidate) => {
    navigate('mkt.tools')
    try { window.history.replaceState(null, '', c.marketUrl) } catch { /* ignore */ }
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 520px), 1fr))', gap: 16 }}>
          {cands.map(c => (
            <Column
              key={c.templateId}
              c={c}
              imgUrl={imgByTid[c.templateId] ?? c.img}
              status={status[c.templateId]}
              disabled={busy != null && busy !== c.templateId}
              onForge={() => forge(c)}
              onBuy={() => goBuy(c)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Column({ c, imgUrl, status, disabled, onForge, onBuy }: { c: ShineCandidate; imgUrl: string | null; status?: Status; disabled: boolean; onForge: () => void; onBuy: () => void }) {
  const filled = Math.min(c.count, 4)
  const working = status?.kind === 'working'
  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--aww-text)', lineHeight: 1.2 }} title={c.name}>{c.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
          {c.rarity ? `${c.rarity} · ` : ''}
          <span style={{ color: shineColor(c.shine || 'Stone') }}>{c.shine || 'Stone'}</span>
          {' → '}
          <span style={{ color: shineColor(c.toShine), fontWeight: 700 }}>{c.toShine}</span>
        </div>
      </div>

      {/* four large card-shaped slots — owned copies fill from the left, needed
          ones (dashed) sit on the right. Same tile as the SSO NFT inventory. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '12px 0' }}>
        {[0, 1, 2, 3].map(i => {
          const has = i < filled
          return (
            <NftThumb
              key={i}
              src={has ? imgUrl : null}
              alt={c.name}
              placeholder={has ? 'No image' : 'Need'}
              border={has ? `1px solid ${PRIMARY}` : '1px dashed color-mix(in srgb, var(--aww-text-muted) 45%, transparent)'}
            />
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
            <a href={c.marketUrl}
              onClick={(e) => { e.preventDefault(); onBuy() }}
              style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: LINK, textDecoration: 'none' }}>
              Buy More Here →
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
