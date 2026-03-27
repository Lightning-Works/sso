'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getWaxBalances, getSyndicateTokens, type SyndicateToken } from '@/lib/wallets/balances/wax-balances'
import { getWaxNfts, type WaxNft } from '@/lib/wallets/balances/wax-nfts'
import type { WalletToken } from '@/lib/wallets/types'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

const COLLECTIONS = [
  { slug: 'alien.worlds', name: 'Alien Worlds', banner: 'https://atomichub-ipfs.com/ipfs/QmXkNxYHBYx8wJ9SmsEVLoFw4wUXKMD2PuG4xVxTeZrLZA' },
  { slug: 'triliumquest', name: 'Trilium Quest', banner: 'https://atomichub-ipfs.com/ipfs/QmRJqEKzrVrVFVots1NFg2N5VBThdWQJWqwEZxR2LvUrpf' },
  { slug: 'ultracomix', name: 'UltraComix', banner: 'https://atomichub-ipfs.com/ipfs/QmTKhxAxLVYi3SBrkLu2CAohqjt8HGVXwfEYQYdH96QmWV' },
  { slug: '__misc__', name: 'Misc', banner: '' },
]

const KNOWN_COLLECTION_SLUGS = COLLECTIONS.filter(c => c.slug !== '__misc__').map(c => c.slug)

function WaxPortfolioContent() {
  const searchParams = useSearchParams()
  const account = searchParams.get('account') || ''

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [syndicateTokens, setSyndicateTokens] = useState<SyndicateToken[]>([])
  const [nfts, setNfts] = useState<WaxNft[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedNft, setSelectedNft] = useState<WaxNft | null>(null)
  const [selectedCollection, setSelectedCollection] = useState(COLLECTIONS[0].slug)
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
  const [schemaCounts, setSchemaCounts] = useState<Record<string, number>>({})
  const [ashChatOpen, setAshChatOpen] = useState(false)
  const [ashChatKey, setAshChatKey] = useState('')
  const [ashSideImg, setAshSideImg] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const supabase = createClient()

  // Load Ash character (Starblind app) and user identity
  useEffect(() => {
    // Load Ash from the Starblind app
    supabase.from('apps').select('chat_api_key, app_side_img').eq('slug', 'starblind').single().then(({ data }) => {
      if (data?.chat_api_key) setAshChatKey(data.chat_api_key)
      if (data?.app_side_img) setAshSideImg(`${STORAGE_BASE}/app_side_image/${data.app_side_img}`)
    })
    // Get user identity for chat
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        setUserName(user.user_metadata?.display_name || user.user_metadata?.username || '')
      }
    })
  }, [])

  // Load tokens on mount
  useEffect(() => {
    if (!account) return
    const load = async () => {
      setLoading(true)
      const [tokenData, synData] = await Promise.all([
        getWaxBalances(account),
        getSyndicateTokens(account),
      ])
      setTokens(tokenData)
      setSyndicateTokens(synData)
      setLoading(false)
    }
    load()
  }, [account])

  // Load NFTs when collection changes
  useEffect(() => {
    if (!account) return
    const loadCollection = async () => {
      setLoadingNfts(true)
      setPage(1)
      setSelectedSchema(null)
      if (selectedCollection === '__misc__') {
        const nftData = await getWaxNfts(account, 1, 100)
        const filtered = nftData.nfts.filter(n => !KNOWN_COLLECTION_SLUGS.includes(n.collectionName))
        setNfts(filtered)
        setSchemaCounts({})
        setHasMore(nftData.nfts.length >= 100)
      } else {
        const nftData = await getWaxNfts(account, 1, 100, selectedCollection)
        setNfts(nftData.nfts)
        setHasMore(nftData.nfts.length >= 100)
        // Count schemas for Alien Worlds
        if (selectedCollection === 'alien.worlds') {
          const counts: Record<string, number> = {}
          nftData.nfts.forEach(n => { counts[n.schemaName] = (counts[n.schemaName] || 0) + 1 })
          setSchemaCounts(counts)
        } else {
          setSchemaCounts({})
        }
      }
      setLoadingNfts(false)
    }
    loadCollection()
  }, [account, selectedCollection])

  const loadMore = async () => {
    setLoadingMore(true)
    const nextPage = page + 1
    if (selectedCollection === '__misc__') {
      const data = await getWaxNfts(account, nextPage, 100)
      const filtered = data.nfts.filter(n => !KNOWN_COLLECTION_SLUGS.includes(n.collectionName))
      setNfts(prev => [...prev, ...filtered])
      setHasMore(data.nfts.length >= 100)
    } else {
      const data = await getWaxNfts(account, nextPage, 100, selectedCollection)
      setNfts(prev => [...prev, ...data.nfts])
      setHasMore(data.nfts.length >= 100)
    }
    setPage(nextPage)
    setLoadingMore(false)
  }

  if (!account) {
    return (
      <div className="lw-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--lw-text-muted)' }}>No WAX account specified.</p>
      </div>
    )
  }

  return (
    <div className="lw-account-page">
      <style>{`
        .wax-nft-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
        }
        .wax-page-layout {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          max-width: 75rem;
          margin: 0 auto;
        }
        .wax-main-content {
          max-width: 60rem;
          width: 100%;
          padding: 2rem 1rem;
        }
        .wax-ash-sidebar {
          display: none;
          flex-shrink: 0;
          padding-top: 12rem;
          margin-left: -55px;
          z-index: 10;
          position: relative;
        }
        @media (min-width: 1200px) {
          .wax-ash-sidebar {
            display: block;
          }
        }
        @media (max-width: 768px) {
          .wax-nft-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
          }
        }
      `}</style>
      <div className="wax-page-layout">
      <div className="wax-main-content">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>WAX Portfolio</h1>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{account}</p>
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
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* WAX & TLM tokens */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {tokens.map(t => (
                    <div key={t.symbol} style={{
                      backgroundColor: 'var(--lw-wallet-row-bg)',
                      borderRadius: 'var(--lw-radius-sm)',
                      padding: '0.75rem 1.25rem',
                      minWidth: '120px',
                      textAlign: 'center',
                    }}>
                      <p style={{ color: '#ff8800', fontSize: '0.75rem', margin: 0, fontWeight: 600, letterSpacing: '0.05em' }}>
                        ${t.symbol}{t.symbol === 'TLM' ? ' - Trilium' : ''}
                      </p>
                      <p style={{ color: 'var(--lw-text-white)', fontWeight: 600, fontSize: '1.1rem', margin: '0.2rem 0 0 0' }}>
                        {parseFloat(parseFloat(t.balance).toFixed(2)).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Syndicate Tokens */}
                {syndicateTokens.length > 0 && (
                  <div style={{
                    backgroundColor: 'var(--lw-wallet-row-bg)',
                    borderRadius: 'var(--lw-radius-sm)',
                    padding: '0.75rem 1rem',
                    flex: 1,
                    minWidth: '300px',
                  }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0 0 0.5rem 0', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Syndicate Tokens
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem 0.5rem' }}>
                      {syndicateTokens.map(st => (
                        <div key={st.symbol}>
                          <p style={{ color: '#fff', fontSize: '0.72rem', margin: '0 0 0.25rem 0', fontWeight: 600 }}>
                            {st.planet}
                          </p>
                          <div style={{
                            backgroundColor: '#000',
                            borderRadius: '6px',
                            padding: '0.5rem 0.6rem',
                            position: 'relative',
                            overflow: 'hidden',
                          }}>
                            {/* Planet video background */}
                            <video
                              src={`/planets/${st.planet}.mp4`}
                              autoPlay loop muted playsInline
                              style={{
                                position: 'absolute', inset: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover',
                                opacity: 0.7,
                                pointerEvents: 'none',
                              }}
                            />
                            <div style={{ position: 'relative', zIndex: 1 }}>
                              <p style={{ color: '#ff8800', fontSize: '0.7rem', margin: 0, fontWeight: 600 }}>
                                ${st.symbol}
                              </p>
                              <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontWeight: 500 }}>
                                {st.liquid.toFixed(2)}
                              </p>
                              {st.staked > 0 && (
                                <p style={{ color: '#34A853', fontSize: '0.6rem', margin: '0.1rem 0 0 0' }}>
                                  Staked: {st.staked.toFixed(2)}
                                  {st.stakeDelay != null && ` (${Math.round(st.stakeDelay / 86400)}d lock)`}
                                </p>
                              )}
                              {st.pendingUnstakes.length > 0 && st.pendingUnstakes.map((u, i) => (
                                <p key={i} style={{ color: '#ff8800', fontSize: '0.6rem', margin: '0.1rem 0 0 0' }}>
                                  Unstaking: {u.amount.toFixed(2)} ({new Date(u.releaseTime + 'Z').toLocaleDateString()})
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Collection Tabs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              marginTop: '1.5rem', marginBottom: '1rem',
            }}>
              {COLLECTIONS.map(col => (
                <button
                  key={col.slug}
                  onClick={() => setSelectedCollection(col.slug)}
                  style={{
                    position: 'relative',
                    height: '70px',
                    borderRadius: '8px',
                    border: selectedCollection === col.slug ? '2px solid var(--lw-purple, #6a24fa)' : '2px solid transparent',
                    backgroundColor: 'var(--lw-wallet-row-bg)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    opacity: selectedCollection === col.slug ? 1 : 0.6,
                    transition: 'opacity 0.15s, border-color 0.15s',
                    padding: 0,
                  }}
                  onMouseEnter={e => { if (selectedCollection !== col.slug) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { if (selectedCollection !== col.slug) e.currentTarget.style.opacity = '0.6' }}
                >
                  {col.banner ? (
                    <img
                      src={col.banner}
                      alt={col.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none'
                        e.currentTarget.parentElement!.querySelector('span')!.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <span style={{
                    position: 'absolute', inset: 0,
                    display: col.banner ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '1rem', fontWeight: 600,
                    background: 'linear-gradient(135deg, #3a3938, #1a1a1c)',
                  }}>
                    {col.name}
                  </span>
                </button>
              ))}
            </div>

            {/* NFTs */}
            <div className="lw-section">
              <h2 className="lw-section-title">
                {COLLECTIONS.find(c => c.slug === selectedCollection)?.name} NFTs
                {!loadingNfts && ` (${(selectedSchema ? nfts.filter(n => n.schemaName === selectedSchema) : nfts).length}${hasMore ? '+' : ''})`}
              </h2>

              {/* Schema tabs for Alien Worlds */}
              {selectedCollection === 'alien.worlds' && Object.keys(schemaCounts).length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedSchema(null)}
                    style={{
                      padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                      fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                      backgroundColor: selectedSchema === null ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
                      color: selectedSchema === null ? '#fff' : 'var(--lw-text-muted)',
                    }}
                  >
                    All [{nfts.length}]
                  </button>
                  {[
                    { schema: 'tool.worlds', label: 'Tools' },
                    { schema: 'land.worlds', label: 'Land' },
                    { schema: 'arms.worlds', label: 'Weapons' },
                    { schema: 'crew.worlds', label: 'Crew' },
                    { schema: 'faces.worlds', label: 'Faces' },
                    { schema: 'items.worlds', label: 'Items' },
                  ].map(({ schema, label }) => {
                    const count = schemaCounts[schema] || 0
                    return (
                      <button
                        key={schema}
                        onClick={() => count > 0 ? setSelectedSchema(schema) : undefined}
                        style={{
                          padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                          fontSize: '0.75rem', fontWeight: 500,
                          cursor: count > 0 ? 'pointer' : 'default',
                          backgroundColor: selectedSchema === schema ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
                          color: selectedSchema === schema ? '#fff' : 'var(--lw-text-muted)',
                          opacity: count > 0 ? 1 : 0.35,
                        }}
                      >
                        {label} [{count}]
                      </button>
                    )
                  })}
                </div>
              )}

              {loadingNfts ? (
                <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Loading NFTs...</p>
              ) : nfts.length === 0 ? (
                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No NFTs found in this collection</p>
              ) : (
                <>
                  <div className="wax-nft-grid">
                    {(selectedSchema ? nfts.filter(n => n.schemaName === selectedSchema) : nfts).map(nft => (
                      <div
                        key={nft.assetId}
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
                          width: '100%', aspectRatio: '5 / 7',
                          backgroundColor: '#1a1a1c',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden',
                        }}>
                          {nft.videoUrl ? (
                            <video src={nft.videoUrl} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : nft.imageUrl ? (
                            <img src={nft.imageUrl} alt={nft.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <span style={{ color: '#7a7572', fontSize: '0.7rem' }}>No image</span>
                          )}
                        </div>
                        <div style={{ padding: '0.5rem 0.6rem' }}>
                          <p style={{ color: 'var(--lw-text-white)', fontSize: '0.8rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nft.name}</p>
                          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: '0.15rem 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nft.collectionDisplayName}</p>
                          {nft.rarity && <p style={{ color: '#ff8800', fontSize: '0.6rem', margin: '0.15rem 0 0 0', textTransform: 'capitalize' }}>{nft.rarity}</p>}
                          {nft.mintNumber && nft.maxSupply && nft.maxSupply !== '0' && (
                            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', margin: '0.15rem 0 0 0' }}>Mint #{nft.mintNumber} / {nft.maxSupply}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {hasMore && (
                    <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                      <button onClick={loadMore} disabled={loadingMore} className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.5rem 2rem' }}>
                        {loadingMore ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Ash character sidebar — only when Alien Worlds is selected */}
      {selectedCollection === 'alien.worlds' && ashSideImg && (
        <div className="wax-ash-sidebar">
          <div style={{ position: 'sticky', top: '2rem' }}>
            {/* Chat bubble */}
            {!ashChatOpen && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', position: 'relative' }}>
                <button
                  onClick={() => ashChatKey ? setAshChatOpen(true) : alert('Ash chat not configured yet. Add a Chat API Key to the Starblind app in the admin panel.')}
                  className="lw-btn lw-btn-primary"
                  style={{
                    width: 'auto',
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.85rem',
                    lineHeight: '1.4',
                    textAlign: 'center',
                  }}
                >
                  Chat with me<br />about<br />Alien Worlds
                  <div style={{
                    position: 'absolute',
                    bottom: '-16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0, height: 0,
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '16px solid var(--lw-purple)',
                  }} />
                </button>
              </div>
            )}
            {/* Ash image */}
            <img
              src={ashSideImg}
              alt="Ash"
              style={{ maxHeight: 'var(--lw-character-max-height)', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>
      )}
      </div>

      {/* Ash Chat Overlay */}
      {ashChatOpen && ashChatKey && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setAshChatOpen(false) }}
        >
          <div className="lw-panel" style={{
            padding: 0, overflow: 'hidden', position: 'relative',
            width: '420px', maxWidth: '95vw',
          }}>
            <button
              onClick={() => setAshChatOpen(false)}
              style={{
                position: 'absolute', top: '8px', right: '8px', zIndex: 10,
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', lineHeight: 1,
              }}
            >
              ✕
            </button>
            <iframe
              src={`https://fairytime.lovable.app/embed/chat?key=${ashChatKey}&bg=1a112e&accent=6a24fa&header=false${userId ? `&user_id=${encodeURIComponent(userId)}` : ''}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`}
              style={{ width: '100%', height: '650px', border: 'none', display: 'block' }}
              allow="clipboard-write"
              title="Character Chat"
            />
          </div>
        </div>
      )}

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
            >
              ✕
            </button>

            <div style={{
              width: '100%', maxHeight: '450px',
              backgroundColor: '#0d0d0d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px 12px 0 0', overflow: 'hidden',
            }}>
              {selectedNft.videoUrl ? (
                <video src={selectedNft.videoUrl} poster={selectedNft.imageUrl || undefined} autoPlay loop muted playsInline controls style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }} />
              ) : selectedNft.imageUrl ? (
                <img src={selectedNft.imageUrl} alt={selectedNft.name} style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#7a7572' }}>No image available</div>
              )}
            </div>

            <div style={{ padding: '1.25rem' }}>
              <h2 style={{ color: 'var(--lw-text-white)', margin: '0 0 0.25rem 0', fontSize: '1.3rem' }}>{selectedNft.name}</h2>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                {selectedNft.collectionDisplayName}{selectedNft.schemaName && ` · ${selectedNft.schemaName}`}
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
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Asset ID</p>
                  <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontFamily: 'monospace' }}>{selectedNft.assetId}</p>
                </div>
                {selectedNft.templateId && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Template</p>
                    <p style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', margin: '0.15rem 0 0 0', fontFamily: 'monospace' }}>{selectedNft.templateId}</p>
                  </div>
                )}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Transferable</p>
                  <p style={{ color: selectedNft.isTransferable ? '#34A853' : '#ff4444', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.isTransferable ? 'Yes' : 'No'}</p>
                </div>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: 0 }}>Burnable</p>
                  <p style={{ color: selectedNft.isBurnable ? '#34A853' : '#ff4444', fontSize: '0.85rem', margin: '0.15rem 0 0 0' }}>{selectedNft.isBurnable ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {Object.keys(selectedNft.data).filter(k => !['name', 'img', 'image', 'video', 'description', 'rarity', 'Rarity'].includes(k)).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Attributes</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {Object.entries(selectedNft.data)
                      .filter(([k]) => !['name', 'img', 'image', 'video', 'description', 'rarity', 'Rarity'].includes(k))
                      .map(([key, value]) => (
                        <div key={key} style={{
                          backgroundColor: 'rgba(106,36,250,0.15)',
                          padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem',
                        }}>
                          <span style={{ color: 'var(--lw-text-muted)' }}>{key}: </span>
                          <span style={{ color: 'var(--lw-text-white)' }}>{String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <a
                  href={`https://wax.atomichub.io/explorer/asset/wax-mainnet/${selectedNft.assetId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="lw-link" style={{ fontSize: '0.85rem' }}
                >
                  View on AtomicHub →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WaxPortfolioPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading...</p></div>}>
      <WaxPortfolioContent />
    </Suspense>
  )
}
