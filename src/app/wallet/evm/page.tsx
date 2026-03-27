'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getEvmBalances } from '@/lib/wallets/balances/evm-balances'
import { getEvmNfts, type EvmNft } from '@/lib/wallets/balances/evm-nfts'
import { getTokenPrices, formatUsd } from '@/lib/wallets/balances/prices'
import type { WalletToken } from '@/lib/wallets/types'

function EvmPortfolioContent() {
  const searchParams = useSearchParams()
  const address = searchParams.get('address') || ''

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [nfts, setNfts] = useState<EvmNft[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [selectedNft, setSelectedNft] = useState<EvmNft | null>(null)
  const [selectedChain, setSelectedChain] = useState<string | null>(null)

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
      <style>{`
        .evm-nft-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
        }
        @media (max-width: 768px) {
          .evm-nft-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
          }
        }
      `}</style>
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
                        <p style={{ color: '#ff8800', fontSize: '0.75rem', margin: 0, fontWeight: 600, letterSpacing: '0.05em' }}>
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
                        {t.name && t.name !== t.symbol && (
                          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', margin: '0.1rem 0 0 0' }}>{t.name}</p>
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

              {loadingNfts ? (
                <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Loading NFTs...</p>
              ) : filteredNfts.length === 0 ? (
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No NFTs found</p>
              ) : (
                <div className="evm-nft-grid">
                  {filteredNfts.map((nft, i) => (
                    <div
                      key={`${nft.contractAddress}-${nft.tokenId}-${i}`}
                      onClick={() => setSelectedNft(nft)}
                      style={{
                        backgroundColor: 'var(--lw-wallet-row-bg)',
                        borderRadius: 'var(--lw-radius-sm)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'transform 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <div style={{
                        width: '100%', aspectRatio: '1',
                        backgroundColor: '#1a1a1c',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        {nft.imageUrl ? (
                          <img src={nft.imageUrl} alt={nft.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <span style={{ color: '#7a7572', fontSize: '0.7rem' }}>No image</span>
                        )}
                      </div>
                      <div style={{ padding: '0.5rem 0.6rem' }}>
                        <p style={{ color: 'var(--lw-text-white)', fontSize: '0.8rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nft.name}</p>
                        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: '0.15rem 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nft.collectionName}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.15rem' }}>
                          <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem' }}>{nft.chain}</span>
                          {nft.floorPrice != null && <span style={{ color: '#ff8800', fontSize: '0.55rem' }}>Floor: {nft.floorPrice.toFixed(3)} ETH</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* NFT Detail Lightbox */}
      {selectedNft && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedNft(null) }}
        >
          <div style={{
            backgroundColor: 'var(--lw-wallet-row-bg, #1a1a1c)',
            borderRadius: '12px',
            maxWidth: '700px', width: '100%', maxHeight: '90vh',
            overflow: 'auto', position: 'relative',
          }}>
            <button
              onClick={() => setSelectedNft(null)}
              style={{
                position: 'sticky', top: '8px', float: 'right', marginRight: '8px',
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', lineHeight: 1, zIndex: 10,
              }}
            >✕</button>

            <div style={{
              width: '100%', maxHeight: '450px',
              backgroundColor: '#0d0d0d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px 12px 0 0', overflow: 'hidden',
            }}>
              {selectedNft.imageUrl ? (
                <img src={selectedNft.imageUrl} alt={selectedNft.name} style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#7a7572' }}>No image available</div>
              )}
            </div>

            <div style={{ padding: '1.25rem' }}>
              <h2 style={{ color: 'var(--lw-text-white)', margin: '0 0 0.25rem 0', fontSize: '1.3rem' }}>{selectedNft.name}</h2>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                {selectedNft.collectionName} · {selectedNft.chain} · {selectedNft.tokenType}
              </p>

              {selectedNft.description && (
                <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem 0', lineHeight: '1.5' }}>{selectedNft.description}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Token ID</p>
                  <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNft.tokenId}</p>
                </div>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Contract</p>
                  <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedNft.contractAddress.slice(0, 8)}...{selectedNft.contractAddress.slice(-6)}</p>
                </div>
                {selectedNft.floorPrice != null && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Floor Price</p>
                    <p style={{ color: '#ff8800', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.floorPrice.toFixed(4)} ETH</p>
                  </div>
                )}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Chain</p>
                  <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.chain}</p>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <a
                  href={`https://opensea.io/assets/${selectedNft.chain.toLowerCase() === 'ethereum' ? 'ethereum' : selectedNft.chain.toLowerCase()}/${selectedNft.contractAddress}/${selectedNft.tokenId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="lw-link" style={{ fontSize: '0.85rem' }}
                >
                  View on OpenSea →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
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
