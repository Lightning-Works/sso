'use client'

import { useEffect, useState } from 'react'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchNftItems } from '../lib/aw/nftItems'
import type { FeatureProps } from './ctx'

/**
 * NFT inventory. Reuses the SSO NftGrid (glows, lightbox, comic + webtoon
 * reader) AND the SSO thumbnail cache (useThumbnails → /api/nft-thumbs) for
 * fast-loading tiles. An optional `schema` scopes to one category (Land, Tools…).
 */
export default function Inventory({ account, schema, label }: FeatureProps & { schema?: string; label?: string }) {
  const [items, setItems] = useState<NftItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const { fetchThumbs, applyThumbs } = useThumbnails()

  useEffect(() => {
    if (!account) { setItems(null); return }
    setLoading(true)
    fetchNftItems(account, schema)
      .then(list => { setItems(list); fetchThumbs(list, account) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [account, schema, fetchThumbs])

  return (
    <>
      <PageHead title={`Inventory${label ? ` · ${label}` : ''}`} desc="Your Alien Worlds digital collectibles — land, tools, avatars, weapons and more." />
      <Card tag="live read">
        {!account
          ? <Empty text="Load or connect a WAX account to see your collectibles." />
          : <NftGrid
              nfts={applyThumbs(items || [])}
              loading={loading}
              storageKey={`aww-nft-${account}`}
              emptyMessage="No collectibles found on this account."
              columns={5}
              mobileColumns={2}
              showViewTabs={false}
            />}
      </Card>
    </>
  )
}
