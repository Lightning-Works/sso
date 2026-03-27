'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getSolanaBalances } from '@/lib/wallets/balances/solana-balances'
import { getSolanaNfts, type SolanaNft } from '@/lib/wallets/balances/solana-nfts'
import { getTokenPrices, getSolanaPricesAndLogos } from '@/lib/wallets/balances/prices'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { TokenGrid } from '@/components/TokenGrid'
import { createClient } from '@/lib/supabase/client'
import type { WalletToken } from '@/lib/wallets/types'

function solanaToNftItems(nfts: SolanaNft[]): NftItem[] {
  return nfts.map(nft => ({
    id: nft.id,
    name: nft.name,
    imageUrl: nft.imageUrl,
    collection: nft.collection,
    description: nft.description,
    chain: nft.isCompressed ? 'Solana (cNFT)' : 'Solana',
    tokenType: nft.isCompressed ? 'Compressed' : 'NFT',
    externalUrl: nft.externalUrl || `https://solscan.io/token/${nft.id}`,
    attributes: nft.attributes,
  }))
}

function SolanaPortfolioContent() {
  const searchParams = useSearchParams()
  const address = searchParams.get('address') || ''

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [nfts, setNfts] = useState<SolanaNft[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [filterCompressed, setFilterCompressed] = useState<boolean | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'superadmin') setIsSuperadmin(true)
    })
  }, [])

  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoading(true)
      const [tokenData, priceData] = await Promise.all([
        getSolanaBalances(address),
        getTokenPrices(),
      ])
      // Fetch DexScreener prices + logos for all SPL tokens
      const splTokens = tokenData.filter(t => t.address).map(t => ({ symbol: t.symbol, address: t.address }))
      const { prices: dexPrices, logos } = await getSolanaPricesAndLogos(splTokens)

      // Apply logos to tokens that don't already have one
      for (const t of tokenData) {
        if (!t.logoUrl && logos[t.symbol]) {
          t.logoUrl = logos[t.symbol]
        }
      }

      setTokens(tokenData)
      setPrices({ ...priceData, ...dexPrices })
      setLoading(false)
    }
    load()
  }, [address])

  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoadingNfts(true)
      const nftData = await getSolanaNfts(address)
      setNfts(nftData)
      setLoadingNfts(false)
    }
    load()
  }, [address])

  const regularCount = nfts.filter(n => !n.isCompressed).length
  const compressedCount = nfts.filter(n => n.isCompressed).length
  const filteredNfts = filterCompressed === null ? nfts
    : filterCompressed ? nfts.filter(n => n.isCompressed)
    : nfts.filter(n => !n.isCompressed)

  if (!address) {
    return (
      <div className="lw-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--lw-text-muted)' }}>No Solana address specified.</p>
      </div>
    )
  }

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '60rem', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>Solana Portfolio</h1>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>
              {address.slice(0, 8)}...{address.slice(-8)}
            </p>
          </div>
          <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            ← Back
          </a>
        </div>

        {loading ? (
          <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>Loading portfolio...</p>
        ) : (
          <>
            {/* Token Balances */}
            <div className="lw-section">
              <h2 className="lw-section-title">Tokens</h2>
              <TokenGrid
                tokens={tokens}
                prices={prices}
                nativeSymbol="SOL"
                storageKey={`token-spam-sol-${address}`}
              />
            </div>

            {/* NFTs */}
            <div className="lw-section" style={{ marginTop: '1.5rem' }}>
              <h2 className="lw-section-title">
                NFTs {!loadingNfts && `(${filteredNfts.length})`}
              </h2>

              {/* Filter tabs */}
              {!loadingNfts && nfts.length > 0 && (regularCount > 0 || compressedCount > 0) && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  {[
                    { label: `All [${nfts.length}]`, value: null as boolean | null },
                    { label: `Regular [${regularCount}]`, value: false },
                    { label: `Compressed [${compressedCount}]`, value: true },
                  ].map(tab => (
                    <button
                      key={String(tab.value)}
                      onClick={() => setFilterCompressed(tab.value)}
                      style={{
                        padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                        fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                        backgroundColor: filterCompressed === tab.value ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
                        color: filterCompressed === tab.value ? '#fff' : 'var(--lw-text-muted)',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              <NftGrid
                nfts={solanaToNftItems(filteredNfts)}
                loading={loadingNfts}
                emptyMessage="No NFTs found"
                storageKey={`nft-tags-sol-${address}`}
                isSuperadmin={isSuperadmin}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function SolanaPortfolioPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading...</p></div>}>
      <SolanaPortfolioContent />
    </Suspense>
  )
}
