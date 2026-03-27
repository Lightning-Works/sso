'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getEvmBalances } from '@/lib/wallets/balances/evm-balances'
import { getEvmNfts, type EvmNft } from '@/lib/wallets/balances/evm-nfts'
import { getTokenPrices } from '@/lib/wallets/balances/prices'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { TokenGrid } from '@/components/TokenGrid'
import { createClient } from '@/lib/supabase/client'
import type { WalletToken } from '@/lib/wallets/types'

function evmToNftItems(nfts: EvmNft[]): NftItem[] {
  return nfts.map(nft => ({
    id: `${nft.contractAddress}-${nft.tokenId}`,
    name: nft.name,
    imageUrl: nft.imageUrl,
    videoUrl: nft.videoUrl,
    collection: nft.collectionName,
    description: nft.description,
    chain: nft.chain,
    tokenType: nft.tokenType,
    floorPrice: nft.floorPrice,
    attributes: nft.attributes.length > 0 ? nft.attributes : undefined,
    externalUrl: nft.chain === 'Ethereum' || nft.chain === 'Polygon' || nft.chain === 'Base'
      ? `https://opensea.io/assets/${nft.chain.toLowerCase()}/${nft.contractAddress}/${nft.tokenId}`
      : undefined,
  }))
}

function EvmPortfolioContent() {
  const searchParams = useSearchParams()
  const address = searchParams.get('address') || ''

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [nfts, setNfts] = useState<EvmNft[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [selectedChain, setSelectedChain] = useState<string | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'superadmin') setIsSuperadmin(true)
    })
  }, [])

  // Load tokens on mount
  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoading(true)
      const [tokenData, priceData] = await Promise.all([
        getEvmBalances(address),
        getTokenPrices(),
      ])
      setTokens(tokenData)
      setPrices(priceData)
      setLoading(false)
    }
    load()
  }, [address])

  // Load NFTs on mount
  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoadingNfts(true)
      const nftData = await getEvmNfts(address)
      setNfts(nftData)
      setLoadingNfts(false)
    }
    load()
  }, [address])

  const chains = [...new Set(nfts.map(n => n.chain))]
  const filteredNfts = selectedChain ? nfts.filter(n => n.chain === selectedChain) : nfts

  // Group tokens by chain
  const tokensByChain: Record<string, WalletToken[]> = {}
  tokens.forEach(t => {
    const chain = t.chain === 'evm' ? (t.walletAddress ? 'EVM' : 'EVM') : t.chain
    if (!tokensByChain[chain]) tokensByChain[chain] = []
    tokensByChain[chain].push(t)
  })

  if (!address) {
    return (
      <div className="lw-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--lw-text-muted)' }}>No EVM address specified.</p>
      </div>
    )
  }

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '60rem', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>EVM Portfolio</h1>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{address}</p>
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
                nativeSymbol="ETH"
                storageKey={`token-spam-evm-${address}`}
              />
            </div>

            {/* NFTs */}
            <div className="lw-section" style={{ marginTop: '1.5rem' }}>
              <h2 className="lw-section-title">
                NFTs {!loadingNfts && `(${filteredNfts.length})`}
              </h2>

              {/* Chain filter tabs */}
              {chains.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedChain(null)}
                    style={{
                      padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                      fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                      backgroundColor: selectedChain === null ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
                      color: selectedChain === null ? '#fff' : 'var(--lw-text-muted)',
                    }}
                  >
                    All [{nfts.length}]
                  </button>
                  {chains.map(chain => {
                    const count = nfts.filter(n => n.chain === chain).length
                    return (
                      <button
                        key={chain}
                        onClick={() => setSelectedChain(chain)}
                        style={{
                          padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                          fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                          backgroundColor: selectedChain === chain ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
                          color: selectedChain === chain ? '#fff' : 'var(--lw-text-muted)',
                        }}
                      >
                        {chain} [{count}]
                      </button>
                    )
                  })}
                </div>
              )}

              <NftGrid
                nfts={evmToNftItems(filteredNfts)}
                loading={loadingNfts}
                emptyMessage="No NFTs found"
                storageKey={`nft-tags-evm-${address}`}
                isSuperadmin={isSuperadmin}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function EvmPortfolioPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading...</p></div>}>
      <EvmPortfolioContent />
    </Suspense>
  )
}
