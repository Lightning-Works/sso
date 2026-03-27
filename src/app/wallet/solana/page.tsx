'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getSolanaBalances } from '@/lib/wallets/balances/solana-balances'
import { getSolanaNfts, type SolanaNft } from '@/lib/wallets/balances/solana-nfts'
import { getTokenPrices, formatUsd } from '@/lib/wallets/balances/prices'
import { NftGrid, type NftItem } from '@/components/NftGrid'
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

  useEffect(() => {
    if (!address) return
    const load = async () => {
      setLoading(true)
      const [tokenData, priceData] = await Promise.all([
        getSolanaBalances(address),
        getTokenPrices(),
      ])
      setTokens(tokenData)
      setPrices(priceData)
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
              {tokens.length === 0 ? (
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No tokens found</p>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {tokens.map((t, i) => {
                    const usdValue = prices[t.symbol] ? parseFloat(t.balance) * prices[t.symbol] : null
                    return (
                      <div key={`${t.symbol}-${i}`} style={{
                        backgroundColor: 'var(--lw-wallet-row-bg)',
                        borderRadius: 'var(--lw-radius-sm)',
                        padding: '0.75rem 1.25rem',
                        minWidth: '120px',
                        textAlign: 'center',
                      }}>
                        <p style={{ color: 'var(--nft-accent, #ff8800)', fontSize: '0.75rem', margin: 0, fontWeight: 600, letterSpacing: '0.05em' }}>
                          ${t.symbol}
                        </p>
                        <p style={{ color: 'var(--lw-text-white)', fontWeight: 600, fontSize: '1.1rem', margin: '0.2rem 0 0 0' }}>
                          {parseFloat(parseFloat(t.balance).toFixed(4)).toLocaleString()}
                        </p>
                        {usdValue != null && usdValue > 0.01 && (
                          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0.15rem 0 0 0' }}>
                            ({formatUsd(usdValue)} USD)
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
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
