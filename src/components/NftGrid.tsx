'use client'

import { useState } from 'react'

export interface NftItem {
  id: string
  name: string
  imageUrl: string | null
  videoUrl?: string | null
  collection: string
  description?: string | null
  chain?: string
  rarity?: string | null
  mintNumber?: string | null
  maxSupply?: string | null
  tokenType?: string
  floorPrice?: number | null
  externalUrl?: string | null
  attributes?: { key: string; value: string }[]
}

interface NftGridProps {
  nfts: NftItem[]
  loading?: boolean
  emptyMessage?: string
  /** 'card' for tall trading cards (5:7), 'square' for square thumbnails */
  aspectRatio?: 'card' | 'square'
  columns?: number
  mobileColumns?: number
}

export function NftGrid({
  nfts,
  loading = false,
  emptyMessage = 'No NFTs found',
  aspectRatio = 'square',
  columns = 5,
  mobileColumns = 3,
}: NftGridProps) {
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null)

  const gridClass = `nft-grid-${columns}-${mobileColumns}`

  return (
    <>
      <style>{`
        .${gridClass} {
          display: grid;
          grid-template-columns: repeat(${columns}, 1fr);
          gap: 1rem;
        }
        @media (max-width: 768px) {
          .${gridClass} {
            grid-template-columns: repeat(${mobileColumns}, 1fr);
            gap: 0.5rem;
          }
        }
      `}</style>

      {loading ? (
        <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Loading NFTs...</p>
      ) : nfts.length === 0 ? (
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>{emptyMessage}</p>
      ) : (
        <div className={gridClass}>
          {nfts.map((nft, i) => (
            <div
              key={`${nft.id}-${i}`}
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
              {/* Thumbnail */}
              <div style={{
                width: '100%',
                aspectRatio: aspectRatio === 'card' ? '5 / 7' : '1',
                backgroundColor: '#1a1a1c',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {nft.videoUrl ? (
                  <video
                    src={nft.videoUrl}
                    poster={nft.imageUrl || undefined}
                    autoPlay loop muted playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : nft.imageUrl ? (
                  <img
                    src={nft.imageUrl}
                    alt={nft.name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span style={{ color: '#7a7572', fontSize: '0.7rem' }}>No image</span>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '0.5rem 0.6rem' }}>
                <p style={{ color: 'var(--lw-text-white)', fontSize: '0.8rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nft.name}
                </p>
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: '0.15rem 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nft.collection}
                </p>
                {nft.rarity && (
                  <p style={{ color: '#ff8800', fontSize: '0.6rem', margin: '0.15rem 0 0 0', textTransform: 'capitalize' }}>{nft.rarity}</p>
                )}
                {nft.mintNumber && nft.maxSupply && nft.maxSupply !== '0' && (
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', margin: '0.15rem 0 0 0' }}>Mint #{nft.mintNumber} / {nft.maxSupply}</p>
                )}
                {(nft.chain || nft.floorPrice != null) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.15rem' }}>
                    {nft.chain && <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem' }}>{nft.chain}</span>}
                    {nft.floorPrice != null && <span style={{ color: '#ff8800', fontSize: '0.55rem' }}>Floor: {nft.floorPrice.toFixed(3)} ETH</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Lightbox */}
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
            {/* Close */}
            <button
              onClick={() => setSelectedNft(null)}
              style={{
                position: 'sticky', top: '8px', float: 'right', marginRight: '8px',
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', lineHeight: 1, zIndex: 10,
              }}
            >&#x2715;</button>

            {/* Media */}
            <div style={{
              width: '100%', maxHeight: '450px',
              backgroundColor: '#0d0d0d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px 12px 0 0', overflow: 'hidden',
            }}>
              {selectedNft.videoUrl ? (
                <video
                  src={selectedNft.videoUrl}
                  poster={selectedNft.imageUrl || undefined}
                  autoPlay loop muted playsInline controls
                  style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }}
                />
              ) : selectedNft.imageUrl ? (
                <img
                  src={selectedNft.imageUrl}
                  alt={selectedNft.name}
                  style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ padding: '4rem', color: '#7a7572' }}>No image available</div>
              )}
            </div>

            {/* Details */}
            <div style={{ padding: '1.25rem' }}>
              <h2 style={{ color: 'var(--lw-text-white)', margin: '0 0 0.25rem 0', fontSize: '1.3rem' }}>{selectedNft.name}</h2>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                {selectedNft.collection}
                {selectedNft.chain && ` · ${selectedNft.chain}`}
                {selectedNft.tokenType && ` · ${selectedNft.tokenType}`}
              </p>

              {selectedNft.description && (
                <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem 0', lineHeight: '1.5' }}>{selectedNft.description}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {selectedNft.rarity && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Rarity</p>
                    <p style={{ color: '#ff8800', fontSize: '0.85rem', margin: '0.15rem 0 0 0', textTransform: 'capitalize' }}>{selectedNft.rarity}</p>
                  </div>
                )}
                {selectedNft.mintNumber && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Mint</p>
                    <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>
                      #{selectedNft.mintNumber}{selectedNft.maxSupply && selectedNft.maxSupply !== '0' ? ` / ${selectedNft.maxSupply}` : ''}
                    </p>
                  </div>
                )}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>ID</p>
                  <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedNft.id.length > 16 ? `${selectedNft.id.slice(0, 8)}...${selectedNft.id.slice(-6)}` : selectedNft.id}
                  </p>
                </div>
                {selectedNft.floorPrice != null && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Floor Price</p>
                    <p style={{ color: '#ff8800', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.floorPrice.toFixed(4)} ETH</p>
                  </div>
                )}
                {selectedNft.chain && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Chain</p>
                    <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.chain}</p>
                  </div>
                )}
              </div>

              {/* Custom attributes */}
              {selectedNft.attributes && selectedNft.attributes.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Attributes</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedNft.attributes.map(({ key, value }) => (
                      <div key={key} style={{
                        backgroundColor: 'rgba(106,36,250,0.15)',
                        padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                      }}>
                        <span style={{ color: 'var(--lw-text-muted)' }}>{key}: </span>
                        <span style={{ color: 'var(--lw-text-white)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* External link */}
              {selectedNft.externalUrl && (
                <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                  <a
                    href={selectedNft.externalUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="lw-link" style={{ fontSize: '0.85rem' }}
                  >
                    View Details →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
