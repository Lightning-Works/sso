'use client'

import { useEffect, useMemo, useState } from 'react'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftDetailModal } from '../ui/NftDetailModal'
import { fetchNftItems, type AwNft } from '../lib/aw/nftItems'
import { fetchFloorWax } from '../lib/aw/nftPrices'
import { fetchBscAwNfts, rememberedBsc, type BscNft } from '../lib/aw/evmBsc'
import { usePrices } from '../lib/aw/usePrices'
import { fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

/**
 * NFT inventory. WAX (AtomicAssets) by default; the WAX/BINANCE toggle beside the
 * collection title switches to the user's Alien Worlds BSC NFTs (mission rewards)
 * from their connected MetaMask address. Same tiles + detail modal for both.
 */
type Chain = 'wax' | 'bsc'

function bscToAw(n: BscNft, owner: string): AwNft {
  const attr = Object.fromEntries(n.attributes.map(a => [a.key.toLowerCase(), a.value]))
  return {
    id: n.tokenId, tokenId: n.tokenId, name: n.name,
    imageUrl: n.image, thumbUrl: null, videoUrl: null,
    collection: 'Alien Worlds', description: n.description,
    rarity: attr['rarity'] || attr['shine'] || null, shine: attr['shine'] || null,
    mintNumber: null, maxSupply: null, chain: 'BSC',
    externalUrl: n.externalUrl, schema: '', templateId: null,
    mintedAt: null, owner, floorWax: null,
    raw: Object.fromEntries(n.attributes.map(a => [a.key, a.value])),
    attributes: n.attributes,
  } as AwNft
}

export default function Inventory({ account, schema, label }: FeatureProps & { schema?: string; label?: string }) {
  const [chain, setChain] = useState<Chain>('wax')
  const [items, setItems] = useState<AwNft[] | null>(null)
  const [floors, setFloors] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AwNft | null>(null)
  const [thumbsLoading, setThumbsLoading] = useState(false)
  const [bscAddr, setBscAddr] = useState<string | null>(null)
  const { fetchThumbs, applyThumbs } = useThumbnails()
  const prices = usePrices()

  useEffect(() => { setBscAddr(rememberedBsc()) }, [chain])

  useEffect(() => {
    let cancelled = false
    const streamThumbs = async (list: NftItem[], key: string) => {
      setThumbsLoading(true)
      for (let i = 0; i < list.length && !cancelled; i += 2) await fetchThumbs(list.slice(i, i + 2), key)
      if (!cancelled) setThumbsLoading(false)
    }

    if (chain === 'wax') {
      if (!account) { setItems(null); setFloors({}); return }
      setLoading(true)
      fetchNftItems(account, schema)
        .then(list => {
          if (cancelled) return
          setItems(list); setFloors({})
          fetchFloorWax(list.map(n => n.templateId)).then(setFloors).catch(() => {})
          streamThumbs(list as NftItem[], account)
        })
        .catch(() => { if (!cancelled) setItems([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      const addr = rememberedBsc()
      setBscAddr(addr)
      if (!addr) { setItems(null); setFloors({}); return }
      setLoading(true)
      fetchBscAwNfts(addr)
        .then(({ nfts }) => {
          if (cancelled) return
          const mapped = nfts.map(n => bscToAw(n, addr))
          setItems(mapped); setFloors({})
          streamThumbs(mapped as NftItem[], `bsc-${addr}`)
        })
        .catch(() => { if (!cancelled) setItems([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [account, schema, chain, fetchThumbs])

  const priced = useMemo(
    () => (items || []).map(it => ({ ...it, floorWax: it.templateId ? floors[it.templateId] ?? null : null })),
    [items, floors],
  )
  const groups = useMemo(() => {
    const m = new Map<string, AwNft[]>()
    for (const it of priced) { const k = it.collection || 'Alien Worlds'; const arr = m.get(k); if (arr) arr.push(it); else m.set(k, [it]) }
    return [...m.entries()]
  }, [priced])

  const totalUsd = (list: AwNft[]) => {
    if (chain !== 'wax' || !prices) return null
    const wax = list.reduce((sum, n) => sum + (n.floorWax || 0), 0)
    return wax > 0 ? wax * prices.wax : 0
  }

  const toggle = (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {(['wax', 'bsc'] as Chain[]).map(c => (
        <button key={c} onClick={() => setChain(c)}
          className={`${s.btn} ${chain === c ? s.btnPrimary : s.btnGhost}`}
          style={{ padding: '5px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em' }}>
          {c === 'wax' ? 'WAX' : 'BINANCE'}
        </button>
      ))}
    </div>
  )
  const headerOnly = (text: string) => (
    <Card tag="live read">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{toggle}</div>
      <Empty text={text} />
    </Card>
  )

  return (
    <>
      <PageHead title={`Inventory${label ? ` · ${label}` : ''}`} desc="Your Alien Worlds collectibles — WAX (land, tools, avatars, weapons) and Binance mission NFTs." />

      {chain === 'bsc' && !bscAddr ? headerOnly('Connect MetaMask in Wallet › Binance (MetaMask) to see your Binance (BSC) Alien Worlds NFTs.')
        : chain === 'wax' && !account ? headerOnly('Load or connect a WAX account to see your collectibles.')
        : loading && !items ? headerOnly(chain === 'bsc' ? 'Reading your Binance NFTs…' : 'Reading your collectibles…')
        : groups.length === 0 ? headerOnly(chain === 'bsc' ? 'No Alien Worlds NFTs on this Binance address.' : 'No collectibles found on this account.')
        : (
          groups.map(([collection, list], gi) => {
            const usd = totalUsd(list)
            return (
              <Card key={collection} tag="live read">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--aww-h2-size, 19px)', color: 'var(--aww-text)', fontFamily: 'var(--aww-font-head, inherit)' }}>{collection} Collection</h2>
                    {usd != null && (
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 50%, #fff)' }}>
                        Total Collection Value: ~{usd > 0 ? fmtUsd(usd) : '$0.00'}
                      </div>
                    )}
                    {chain === 'bsc' && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--aww-text-muted, #9aa)' }}>Binance Smart Chain · mission NFTs</div>}
                  </div>
                  {gi === 0 && toggle}
                </div>
                <NftGrid
                  nfts={applyThumbs(list as NftItem[])}
                  loading={loading}
                  storageKey={`aww-nft-${chain}-${account || bscAddr}`}
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
