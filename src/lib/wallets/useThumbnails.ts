import { useState, useCallback } from 'react'
import type { NftItem } from '@/components/NftGrid'

export function useThumbnails() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const fetchThumbs = useCallback(async (nfts: NftItem[], walletAddress: string) => {
    const toFetch = nfts.filter(n => n.imageUrl && !n.thumbUrl)
    if (toFetch.length === 0) return

    setLoading(true)
    try {
      const res = await fetch('/api/nft-thumbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfts: toFetch.map(n => ({ id: n.id, imageUrl: n.imageUrl, chain: n.chain || '' })),
          walletAddress,
        }),
      })
      const data = await res.json()
      if (data.thumbs) {
        setThumbs(prev => ({ ...prev, ...data.thumbs }))
      }
    } catch {
      // Thumbnail generation failed, grid will use full images
    }
    setLoading(false)
  }, [])

  const applyThumbs = useCallback((nfts: NftItem[]): NftItem[] => {
    if (Object.keys(thumbs).length === 0) return nfts
    return nfts.map(nft => ({
      ...nft,
      thumbUrl: nft.thumbUrl || thumbs[nft.id] || null,
    }))
  }, [thumbs])

  return { fetchThumbs, applyThumbs, thumbsLoading: loading }
}
