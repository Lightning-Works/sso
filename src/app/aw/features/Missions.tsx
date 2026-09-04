'use client'

/**
 * Missions — live, read-only view of Alien Worlds missions (BSC), from the
 * official API. Shows the reward NFT, reward pool, how many spacecraft have
 * joined, min TLM, duration and time left. Joining (approve TLM + board) is
 * Phase B and needs the connected MetaMask wallet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHead, Card, Empty } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import type { NftItem } from '@/components/NftGrid'
import { fetchMissions, type Mission } from '../lib/aw/missions'
import { usePrices } from '../lib/aw/usePrices'

const MUTED = 'var(--aww-text-muted, #9aa)'
const n = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 0 })
const STATUS_COLOR: Record<string, string> = { boarding: '#4be1c2', soon: '#7fc8ff', inflight: 'var(--aww-primary, #b06cff)', completed: MUTED }

export default function Missions() {
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const prices = usePrices()
  const { fetchThumbs, applyThumbs, thumbsLoading } = useThumbnails()

  // Reward NFT art via the proxy (same-origin webp) — the source is on Pinata/IPFS
  // which the browser can't load cross-origin reliably.
  const items = useMemo<NftItem[]>(() => (missions || []).filter(m => m.rewardImg).map(m => ({ id: m.id, name: m.rewardName || m.name, imageUrl: m.rewardImg, chain: 'BSC', collection: 'AW Missions' })), [missions])
  useEffect(() => { if (items.length) fetchThumbs(items, 'aww-missions') }, [items, fetchThumbs])
  const imgByMission = useMemo(() => { const map: Record<string, string | null> = {}; for (const it of applyThumbs(items)) map[it.id] = it.thumbUrl || it.imageUrl; return map }, [items, applyThumbs])

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetchMissions().then(setMissions).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const usd = (tlm: number) => (prices?.tlm ? `~$${(tlm * prices.tlm).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '')

  return (
    <>
      <PageHead
        title="Missions"
        desc={<>Send a spacecraft on an Alien Worlds mission: lock Trilium for the run, then get it back plus a share of the reward pool and an NFT. Missions run on <b style={{ color: 'var(--aww-text)' }}>Binance Smart Chain</b> — connect MetaMask in Wallet › Binance; in-app joining is coming next.</>}
      />
      <Card title="Live missions" tag="live · BSC">
        {loading && !missions ? <Empty text="Loading live missions…" />
          : error ? <p style={{ color: '#ff6b6b' }}>⚠ {error}</p>
          : !missions || missions.length === 0 ? <Empty text="No active missions right now — they rotate; check back soon." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
              {missions.map(m => {
                const perShip = m.ships > 0 ? m.rewardTlm / m.ships : 0
                return (
                  <div key={m.id} style={{ background: 'var(--nft-card-bg, #1a1a1c)', borderRadius: 12, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'relative' }}>
                      <NftThumb src={imgByMission[m.id] ?? m.rewardImg} loading={!imgByMission[m.id] && thumbsLoading} alt={m.rewardName || m.name} radius={0} />
                      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: '#05030f', background: STATUS_COLOR[m.status], borderRadius: 6, padding: '3px 7px' }}>
                        {m.statusLabel.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--aww-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</div>
                      {m.rewardName && <div style={{ fontSize: 11, color: MUTED }}>Reward NFT: <span style={{ color: 'color-mix(in srgb, var(--aww-primary,#b06cff) 55%, #fff)' }}>{m.rewardName}</span></div>}
                      <div style={{ fontSize: 12, color: 'var(--aww-text)' }}>Pool <b>{n(m.rewardTlm)} $TLM</b> <span style={{ color: '#7fc8ff', fontSize: 11 }}>{usd(m.rewardTlm)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED }}>
                        <span>{n(m.ships)} ships</span><span>min {n(m.minTlm)} $TLM</span><span>{m.durationDays}d</span>
                      </div>
                      <div style={{ fontSize: 11, color: STATUS_COLOR[m.status] }}>{m.timeLabel}</div>
                      {perShip > 0 && <div style={{ fontSize: 10, color: MUTED }}>≈ {perShip.toFixed(perShip < 1 ? 3 : 1)} TLM/ship reward</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        <p className="" style={{ marginTop: 12, fontSize: 12, color: MUTED }}>
          The reward pool is split across all ships, so the TLM payout per ship is small — the real draw is getting your locked TLM back plus the mission NFT. Joining from here (approve + board on BSC) is the next phase.
        </p>
      </Card>
    </>
  )
}
