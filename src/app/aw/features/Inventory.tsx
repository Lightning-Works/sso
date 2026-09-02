'use client'

import { useEffect, useMemo, useState } from 'react'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftDetailModal } from '../ui/NftDetailModal'
import { fetchNftItems, type AwNft } from '../lib/aw/nftItems'
import { fetchFloorWax } from '../lib/aw/nftPrices'
import { usePrices } from '../lib/aw/usePrices'
import { fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

/**
 * NFT inventory. Reuses the SSO NftGrid tiles (glows, thumbnails) but opens our
 * own detail modal via onCardClick. NFTs are grouped by collection, each with a
 * "[Collection] Collection" heading and a purple total value (sum of lowest
 * market prices). An optional `schema` scopes to one category (Land, Tools…).
 */
export default function Inventory({ account, schema, label }: FeatureProps & { schema?: string; label?: string }) {
  const [items, setItems] = useState<AwNft[] | null>(null)
  const [floors, setFloors] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AwNft | null>(null)
  const [thumbsLoading, setThumbsLoading] = useState(false)
  const { fetchThumbs, applyThumbs } = useThumbnails()
  const prices = usePrices()

  useEffect(() => {
    if (!account) { setItems(null); setFloors({}); return }
    let cancelled = false
    setLoading(true)
    fetchNftItems(account, schema)
      .then(list => {
        if (cancelled) return
        setItems(list)
        fetchFloorWax(list.map(n => n.templateId)).then(setFloors).catch(() => {})
        // Fetch thumbnails in small sequential chunks so tiles stream in as each
        // chunk is ready, instead of all appearing at once after one long batch.
        ;(async () => {
          setThumbsLoading(true)
          // Small chunks: heavy animated encodes are slow, so keep each request
          // well under the serverless time limit (and let tiles stream in).
          for (let i = 0; i < list.length && !cancelled; i += 2) {
            await fetchThumbs(list.slice(i, i + 2), account)
          }
          if (!cancelled) setThumbsLoading(false)
        })()
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [account, schema, fetchThumbs])

  // Merge live floor prices onto items.
  const priced = useMemo(
    () => (items || []).map(it => ({ ...it, floorWax: it.templateId ? floors[it.templateId] ?? null : null })),
    [items, floors],
  )

  // Group by collection, preserving order of first appearance.
  const groups = useMemo(() => {
    const m = new Map<string, AwNft[]>()
    for (const it of priced) {
      const k = it.collection || 'Alien Worlds'
      const arr = m.get(k); if (arr) arr.push(it); else m.set(k, [it])
    }
    return [...m.entries()]
  }, [priced])

  const totalUsd = (list: AwNft[]) => {
    if (!prices) return null
    const wax = list.reduce((sum, n) => sum + (n.floorWax || 0), 0)
    return wax > 0 ? wax * prices.wax : 0
  }

  return (
    <>
      <PageHead title={`Inventory${label ? ` · ${label}` : ''}`} desc="Your Alien Worlds digital collectibles — land, tools, avatars, weapons and more." />

      {!account ? (
        <Card tag="live read"><Empty text="Load or connect a WAX account to see your collectibles." /></Card>
      ) : loading && !items ? (
        <Card tag="live read"><Empty text="Reading your collectibles…" /></Card>
      ) : groups.length === 0 ? (
        <Card tag="live read"><Empty text="No collectibles found on this account." /></Card>
      ) : (
        groups.map(([collection, list]) => {
          const usd = totalUsd(list)
          return (
            <Card key={collection} tag="live read">
              <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--aww-h2-size, 19px)', color: 'var(--aww-text)', fontFamily: 'var(--aww-font-head, inherit)' }}>{collection} Collection</h2>
                {usd != null && (
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 50%, #fff)' }}>
                    Total Collection Value: ~{usd > 0 ? fmtUsd(usd) : '$0.00'}
                  </div>
                )}
              </div>
              <NftGrid
                nfts={applyThumbs(list as NftItem[])}
                loading={loading}
                storageKey={`aww-nft-${account}`}
                emptyMessage="No collectibles found."
                columns={5}
                mobileColumns={2}
                showViewTabs={false}
                animate
                thumbsLoading={thumbsLoading}
                onCardClick={(n) => setSelected(n as AwNft)}
              />
            </Card>
          )
        })
      )}

      {selected && <NftDetailModal nft={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
