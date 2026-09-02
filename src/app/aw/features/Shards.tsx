'use client'

/**
 * Shards & NFT Outpost. Shows your shard (NFT Point) balance and earning rate,
 * then the live craft menu as a progression (cheapest tool → most expensive) with
 * a progress bar toward each and one-tap Fuse (redeempntnft) when affordable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHead, Card, Empty } from '../ui/primitives'
import { NftThumb } from '../ui/NftThumb'
import { ShineBadge } from '@/components/ShineBadge'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import type { NftItem } from '@/components/NftGrid'
import { fetchShardData, buildRedeemActions, type ShardData, type ShardOffer } from '../lib/aw/shards'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import type { FeatureProps } from './ctx'

const PRIMARY = 'var(--aww-primary, #b06cff)'
const MUTED = 'var(--aww-text-muted, #9aa)'
const GOLD = '#ffd24a'
const n = (x: number) => x.toLocaleString()

type Status = { msg: string; kind: 'working' | 'ok' | 'err' }

export default function Shards({ account }: FeatureProps) {
  const [data, setData] = useState<ShardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Record<number, Status>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const { fetchThumbs, applyThumbs, thumbsLoading } = useThumbnails()

  const load = useCallback(() => {
    if (!account) { setData(null); return }
    setLoading(true)
    fetchShardData(account).then(setData).catch(() => setData({ balance: { redeemable: 0, total: 0, daily: 0, weekly: 0 }, offers: [] })).finally(() => setLoading(false))
  }, [account])
  useEffect(load, [load])

  // Proxy thumbnails for the offer tools (same-origin, reliable, animated).
  const items = useMemo<NftItem[]>(
    () => (data?.offers || []).map(o => ({ id: String(o.templateId), name: o.name, imageUrl: o.img, chain: 'WAX', collection: 'Alien Worlds' })),
    [data],
  )
  useEffect(() => { if (items.length) fetchThumbs(items, 'aww-outpost') }, [items, fetchThumbs])
  const imgByTid = useMemo(() => {
    const m: Record<number, string | null> = {}
    for (const it of applyThumbs(items)) m[Number(it.id)] = it.thumbUrl || null
    return m
  }, [items, applyThumbs])

  const craft = async (o: ShardOffer) => {
    if (busy != null) return
    setBusy(o.offerId)
    setStatus(p => ({ ...p, [o.offerId]: { msg: 'Confirm in your wallet…', kind: 'working' } }))
    try {
      if (!currentAccount()) await connectWax()
      const acct = currentAccount() || account
      const res = await transact(buildRedeemActions(acct, o.offerId))
      const tx = String(res.transaction_id || '').slice(0, 8)
      setStatus(p => ({ ...p, [o.offerId]: { msg: `Crafted ${o.name}! ${tx ? `(tx ${tx}…)` : ''}`, kind: 'ok' } }))
      setTimeout(load, 4000)
    } catch (e) {
      setStatus(p => ({ ...p, [o.offerId]: { msg: e instanceof Error ? e.message : 'Craft failed', kind: 'err' } }))
    } finally {
      setBusy(null)
    }
  }

  const bal = data?.balance

  return (
    <>
      <PageHead
        title="Shards & NFT Outpost"
        desc={<>You earn <b style={{ color: GOLD }}>Shards</b> (NFT Points) every time you mine — your tools&rsquo; NFT-point rate decides how many. Fuse them at the Outpost to craft tools, from cheap starters up to rare and legendary gear.</>}
      />

      {!account ? (
        <Card tag="live read"><Empty text="Load or connect a WAX account to see your shards and the Outpost." /></Card>
      ) : (
        <>
          <Card tag="live read">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: MUTED }}>Your shards (spendable)</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: GOLD, lineHeight: 1.1 }}>{bal ? n(bal.redeemable) : '—'}</div>
              </div>
              <div style={{ height: 34, width: 1, background: 'color-mix(in srgb, var(--aww-text-muted) 25%, transparent)' }} />
              <div><div style={{ fontSize: 12, color: MUTED }}>Lifetime earned</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--aww-text)' }}>{bal ? n(bal.total) : '—'}</div></div>
              <div><div style={{ fontSize: 12, color: MUTED }}>Per day (recent)</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--aww-text)' }}>{bal ? n(bal.daily) : '—'}</div></div>
              <div><div style={{ fontSize: 12, color: MUTED }}>Per week</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--aww-text)' }}>{bal ? n(bal.weekly) : '—'}</div></div>
            </div>
          </Card>

          {loading && !data ? (
            <Card tag="live read"><Empty text="Reading the Outpost…" /></Card>
          ) : !data || data.offers.length === 0 ? (
            <Card tag="live read"><Empty text="No craft offers are active right now — the Outpost menu rotates. Keep mining to bank shards for the next one." /></Card>
          ) : (
            <Card title="Craft menu — cheapest to best" tag="live read">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                {data.offers.map(o => (
                  <OfferCard key={o.offerId} o={o} img={imgByTid[o.templateId] ?? null} imgLoading={!imgByTid[o.templateId] && thumbsLoading} bal={bal!} status={status[o.offerId]} disabled={busy != null && busy !== o.offerId} onCraft={() => craft(o)} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  )
}

function OfferCard({ o, img, imgLoading, bal, status, disabled, onCraft }: { o: ShardOffer; img: string | null; imgLoading: boolean; bal: { redeemable: number; daily: number }; status?: Status; disabled: boolean; onCraft: () => void }) {
  const working = status?.kind === 'working'
  const short = Math.max(0, o.required - bal.redeemable)
  const days = short > 0 && bal.daily > 0 ? Math.ceil(short / bal.daily) : 0
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <NftThumb src={img} loading={imgLoading} alt={o.name} radius={8} />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--aww-text)', lineHeight: 1.15 }} title={o.name}>{o.name}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
          {o.rarity && <span>{o.rarity}</span>}
          {o.shine && <ShineBadge shine={o.shine} style={{ fontSize: 10 }} />}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Luck {o.luck} · Delay {o.delay}s · Ease {o.ease}</div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{n(o.required)} shards</span>
          <span style={{ color: MUTED }}>{Math.floor(o.pct)}%</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'color-mix(in srgb, var(--aww-text-muted) 18%, transparent)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${o.pct}%`, background: o.affordable ? '#4be1c2' : `linear-gradient(90deg, ${PRIMARY}, ${GOLD})`, borderRadius: 4 }} />
        </div>
      </div>

      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        {o.affordable ? (
          <button onClick={onCraft} disabled={disabled || working}
            style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 13, color: '#111',
              cursor: disabled || working ? 'default' : 'pointer',
              background: disabled || working ? 'color-mix(in srgb, var(--aww-text-muted) 30%, transparent)' : `linear-gradient(135deg, ${GOLD}, #ffe89a)` }}>
            {working ? 'Fusing…' : 'Fuse shards → Craft'}
          </button>
        ) : (
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4 }}>
            Need <b style={{ color: 'var(--aww-text)' }}>{n(short)}</b> more{days > 0 ? <> · ~{n(days)} days at your rate</> : <> · keep mining</>}
          </div>
        )}
        {status && <div style={{ marginTop: 6, fontSize: 11, color: status.kind === 'err' ? '#ff6b6b' : status.kind === 'ok' ? '#4be1c2' : MUTED }}>{status.msg}</div>}
      </div>
    </Card>
  )
}
