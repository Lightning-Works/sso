'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { themeFromSearchParams, mergeThemes, themeToCssVars } from '@/lib/theme'
import { CHAT_EMBED_BASE } from '@/lib/chat'
import { getWaxBalances, getSyndicateTokens, type SyndicateToken, type PlanetDaoData, SYNDICATE_PLANETS } from '@/lib/wallets/balances/wax-balances'
import { useCallback } from 'react'
import { getTokenPrices, formatUsd } from '@/lib/wallets/balances/prices'
import { TokenGrid } from '@/components/TokenGrid'
import { getWaxNfts, type WaxNft } from '@/lib/wallets/balances/wax-nfts'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import type { WalletToken } from '@/lib/wallets/types'
import { WaxCloudSendPanel } from '@/components/WaxCloudSendPanel'
import { DiviGoWalletPanel } from '@/components/DiviGoWalletPanel'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

function waxToNftItems(nfts: WaxNft[]): NftItem[] {
  return nfts.map(nft => ({
    id: nft.assetId,
    name: nft.name,
    imageUrl: nft.imageUrl,
    videoUrl: nft.videoUrl,
    collection: nft.collectionDisplayName,
    description: nft.description,
    rarity: nft.rarity,
    mintNumber: nft.mintNumber,
    maxSupply: nft.maxSupply,
    externalUrl: `https://wax.atomichub.io/explorer/asset/wax-mainnet/${nft.assetId}`,
    attributes: Object.entries(nft.data)
      .filter(([k]) => !['name', 'img', 'image', 'video', 'description', 'rarity', 'Rarity'].includes(k))
      .map(([key, value]) => ({ key, value: String(value) })),
  }))
}

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
  const embed = searchParams.get('embed') === '1'   // embedded in a game client (Dreadroot) iframe

  // When embedded, the parent game passes its live HUD colors as theme params. Apply them (and go fully
  // transparent, dropping our own panel blur) so the wallet reads as one native panel inside the game's
  // frosted-glass User Panel. Non-embedded views are untouched — this only runs for embed=1.
  const embedThemeCss = useMemo(() => {
    if (!embed) return ''
    const overrides = themeFromSearchParams(new URLSearchParams(searchParams.toString()))
    const vars = themeToCssVars(mergeThemes(null, null, overrides))
    return `${vars}
      html, body, .lw-account-page { background: transparent !important; background-image: none !important; }
      .lw-account-page { padding: 0 !important; min-height: 0 !important; }
      .wax-main-content { padding: 0.75rem !important; }
      .lw-section { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; border: 1px solid var(--lw-border) !important; }
    `
  }, [embed, searchParams])

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [syndicateTokens, setSyndicateTokens] = useState<SyndicateToken[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [nfts, setNfts] = useState<WaxNft[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState(COLLECTIONS[0].slug)
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
  const [schemaCounts, setSchemaCounts] = useState<Record<string, number>>({})
  const [planetModal, setPlanetModal] = useState<{ index: number; data: PlanetDaoData | null; loading: boolean } | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const { fetchThumbs, applyThumbs } = useThumbnails()

  const openPlanet = useCallback(async (index: number) => {
    setPlanetModal({ index, data: null, loading: true })
    try {
      const res = await fetch(`/api/planet?index=${index}`)
      const data: PlanetDaoData = await res.json()
      setPlanetModal({ index, data, loading: false })
    } catch (e) {
      console.error('Failed to load planet data:', e)
      setPlanetModal({ index, data: null, loading: false })
    }
  }, [])

  const navigatePlanet = useCallback((dir: -1 | 1) => {
    if (!planetModal) return
    const next = (planetModal.index + dir + SYNDICATE_PLANETS.length) % SYNDICATE_PLANETS.length
    openPlanet(next)
  }, [planetModal, openPlanet])

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
    // Get user identity for chat + superadmin check
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        setUserName(user.user_metadata?.display_name || user.user_metadata?.username || '')
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role === 'superadmin') setIsSuperadmin(true)
      }
    })
  }, [])

  // Load tokens on mount
  useEffect(() => {
    if (!account) return
    const load = async () => {
      setLoading(true)
      const [tokenData, synData, priceData] = await Promise.all([
        getWaxBalances(account),
        getSyndicateTokens(account),
        getTokenPrices(),
      ])
      setTokens(tokenData)
      setSyndicateTokens(synData)
      setPrices(priceData)
      setLoading(false)
    }
    load()
  }, [account])

  // Embedded in a game client (Dreadroot): echo the account to the parent so it can persist the link,
  // and auto-fit the iframe to content. Only posts to allow-listed Lightningworks/Dreadroot parents.
  useEffect(() => {
    if (!embed || typeof window === 'undefined' || window.parent === window) return
    let parentOrigin = ''
    try { parentOrigin = document.referrer ? new URL(document.referrer).origin : '' } catch {}
    const ok = /^https:\/\/([a-z0-9-]+\.)*(dreadroot\.com|lightningworks\.io)$/.test(parentOrigin)
      || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(parentOrigin)
    if (!ok) return
    const post = (msg: Record<string, unknown>) => { try { window.parent.postMessage({ source: 'lw-sso', ...msg }, parentOrigin) } catch { /* dropped */ } }
    if (account) post({ type: 'wax-account', account })
    const ro = new ResizeObserver(() => post({ type: 'resize', height: Math.ceil(document.documentElement.scrollHeight) }))
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [embed, account])

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

  // Trigger thumbnail generation after NFTs load
  useEffect(() => {
    if (nfts.length > 0 && account) {
      fetchThumbs(waxToNftItems(nfts), account)
    }
  }, [nfts, account, fetchThumbs])

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
      {embed && <style dangerouslySetInnerHTML={{ __html: embedThemeCss }} />}
      <style>{`
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
        }
      `}</style>
      <div className="wax-page-layout">
      <div className="wax-main-content">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>Alien Worlds Portfolio</h1>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{account}</p>
          </div>
          {!embed && (
            <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
              ← Back
            </a>
          )}
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
                <TokenGrid
                  tokens={tokens}
                  prices={prices}
                  nativeSymbol="WAX"
                  labelOverrides={{ TLM: ' - Trilium' }}
                  storageKey={`token-spam-wax-${account}`}
                  allowSpam={false}
                />

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
                      {syndicateTokens.map((st, idx) => (
                        <div key={st.symbol} onClick={() => openPlanet(idx)} style={{ cursor: 'pointer' }}>
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
                                {prices['TLM'] && st.liquid > 0 && (
                                  <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', marginLeft: '0.3rem' }}>
                                    ({formatUsd(st.liquid * prices['TLM'])})
                                  </span>
                                )}
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

            {/* Send — two independent paths: your own Cloud Wallet (direct, non-custodial),
                or DiviGo's custodial balance (approve-by-text, WAX/TLM only). */}
            {!embed && (
              <div className="lw-section">
                <h2 className="lw-section-title">Send</h2>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <WaxCloudSendPanel account={account} tokens={tokens} syndicateTokens={syndicateTokens} />
                  <div style={{ flex: 1, minWidth: '300px' }}>
                    <DiviGoWalletPanel userId={userId || null} diviPrice={0} coins={['wax', 'tlm']} />
                  </div>
                </div>
              </div>
            )}

            {/* Collection Tabs — hidden in the Alien Worlds wallet (only Alien Worlds NFTs show) */}
            {false && (
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
            )}

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

              <NftGrid
                nfts={applyThumbs(waxToNftItems(selectedSchema ? nfts.filter(n => n.schemaName === selectedSchema) : nfts))}
                loading={loadingNfts}
                emptyMessage="No NFTs found in this collection"
                aspectRatio="5 / 7"
                storageKey={`nft-tags-wax-${account}`}
                isSuperadmin={isSuperadmin}
              />
              {!loadingNfts && hasMore && (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  <button onClick={loadMore} disabled={loadingMore} className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.5rem 2rem' }}>
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
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
              src={`${CHAT_EMBED_BASE}/embed/chat?key=${ashChatKey}&bg=1a112e&accent=6a24fa&header=false${userId ? `&user_id=${encodeURIComponent(userId)}` : ''}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`}
              style={{ width: '100%', height: '650px', border: 'none', display: 'block' }}
              allow="clipboard-write"
              title="Character Chat"
            />
          </div>
        </div>
      )}

      {/* Planet DAO Modal */}
      {planetModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'radial-gradient(ellipse at 30% 20%, rgba(15, 10, 40, 0.75), rgba(5, 3, 20, 0.8) 60%, rgba(2, 1, 10, 0.85))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '5vh 0',
            overflow: 'hidden',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPlanetModal(null) }}
        >
          {/* Twinkling stars */}
          <style>{`
            @keyframes twinkle {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 0.9; }
            }
          `}</style>
          {Array.from({ length: 100 }, (_, i) => (
            <div key={`star-${i}`} style={{
              position: 'absolute',
              left: `${Math.sin(i * 137.508) * 50 + 50}%`,
              top: `${Math.cos(i * 73.137) * 50 + 50}%`,
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              borderRadius: '50%',
              backgroundColor: i % 7 === 0 ? '#aaccff' : i % 11 === 0 ? '#ffddaa' : '#ffffff',
              animation: `twinkle ${2 + (i % 4) * 1.5}s ease-in-out ${(i * 0.37) % 5}s infinite`,
              pointerEvents: 'none',
            }} />
          ))}
          {/* Left arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); navigatePlanet(-1) }}
            style={{
              position: 'absolute', left: '2vw', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer',
              fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >&#8249;</button>

          {/* Right arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); navigatePlanet(1) }}
            style={{
              position: 'absolute', right: '2vw', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer',
              fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >&#8250;</button>

          <div style={{
            backgroundColor: '#0d0d10', borderRadius: '16px',
            width: '80%', maxWidth: '50rem', maxHeight: '90vh', overflow: 'auto',
            position: 'relative',
            boxShadow: '0 0 60px 20px rgba(40, 20, 100, 0.3), 0 0 120px 40px rgba(20, 10, 60, 0.2), 0 0 200px 80px rgba(10, 5, 40, 0.15)',
          }}>
            {/* Close button */}
            <button
              onClick={() => setPlanetModal(null)}
              style={{
                position: 'sticky', top: '12px', float: 'right', marginRight: '12px',
                background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
                width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', lineHeight: 1, zIndex: 10,
              }}
            >&#x2715;</button>

            {/* Video header */}
            <div style={{
              width: '100%', aspectRatio: '16 / 9', position: 'relative',
              overflow: 'hidden', borderRadius: '16px 16px 0 0',
              backgroundColor: '#000',
            }}>
              <video
                key={SYNDICATE_PLANETS[planetModal.index].planet}
                src={`/planets/${SYNDICATE_PLANETS[planetModal.index].planet}.mp4`}
                autoPlay loop muted playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '2rem 1.5rem 1rem',
                background: 'linear-gradient(transparent, rgba(13,13,16,0.95))',
              }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>
                  {SYNDICATE_PLANETS[planetModal.index].planet}
                </h2>
                <p style={{ color: '#ff8800', margin: '0.25rem 0 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
                  ${SYNDICATE_PLANETS[planetModal.index].symbol}
                </p>
              </div>
            </div>

            {/* Content */}
            {planetModal.loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--lw-text-muted)' }}>
                Loading planet data...
              </div>
            ) : !planetModal.data || planetModal.data.error ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#ff4444' }}>
                Failed to load planet data. Please try again.
              </div>
            ) : planetModal.data ? (
              <div style={{ padding: '1.5rem' }}>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {[
                    { label: 'Total Supply', value: planetModal.data.totalSupply.split(' ')[0] ? parseFloat(planetModal.data.totalSupply.split(' ')[0]).toLocaleString() : '0' },
                    { label: 'Election Cycle', value: planetModal.data.periodLength >= 86400 ? `${Math.round(planetModal.data.periodLength / 86400)} days` : `${Math.round(planetModal.data.periodLength / 3600)} hrs` },
                    { label: 'Proposal Budget', value: planetModal.data.proposalBudget ? `${parseFloat(planetModal.data.proposalBudget.split(' ')[0] || '0').toLocaleString()} TLM` : 'N/A' },
                    { label: 'Candidate Lockup', value: planetModal.data.lockupAsset || 'N/A' },
                  ].map(s => (
                    <div key={s.label} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem' }}>
                      <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                      <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0 0', fontWeight: 500 }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Staking info */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', flex: 1 }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staking</p>
                    <p style={{ color: planetModal.data.stakingEnabled ? '#34A853' : '#ff4444', fontSize: '0.85rem', margin: '0.25rem 0 0 0', fontWeight: 500 }}>
                      {planetModal.data.stakingEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', flex: 1 }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min Lock</p>
                    <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0 0', fontWeight: 500 }}>{Math.round(planetModal.data.minStakeTime / 86400)} days</p>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', flex: 1 }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Lock</p>
                    <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0 0', fontWeight: 500 }}>{Math.round(planetModal.data.maxStakeTime / 86400)} days</p>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', flex: 1 }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Votes</p>
                    <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0 0', fontWeight: 500 }}>{planetModal.data.maxVotes}</p>
                  </div>
                </div>

                {/* Custodians */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.75rem 0' }}>
                    Custodians ({planetModal.data.custodians.length}/{planetModal.data.numElected})
                  </h3>
                  {planetModal.data.custodians.length === 0 ? (
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No elected custodians — this planet&apos;s DAO is currently inactive.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {planetModal.data.custodians.map((c, i) => (
                        <div key={c.name} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: 'rgba(106, 36, 250, 0.1)', borderRadius: '8px',
                          padding: '0.6rem 0.75rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: '#ff8800', fontSize: '0.85rem', fontWeight: 700, minWidth: '1.5rem' }}>#{i + 1}</span>
                            <span style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}>{c.name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', margin: 0 }}>Vote Power</p>
                              <p style={{ color: '#fff', fontSize: '0.75rem', margin: 0 }}>{Math.round(parseFloat(c.totalVotePower) / 1e9).toLocaleString()}B</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', margin: 0 }}>Voters</p>
                              <p style={{ color: '#fff', fontSize: '0.75rem', margin: 0 }}>{c.numVoters}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Candidates */}
                {planetModal.data.candidates.length > 0 && (
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.75rem 0' }}>
                      Active Candidates ({planetModal.data.candidates.length})
                    </h3>
                    <div style={{ display: 'grid', gap: '0.4rem' }}>
                      {planetModal.data.candidates.map(c => {
                        const isCustodian = planetModal.data!.custodians.some(cu => cu.name === c.name)
                        return (
                          <div key={c.name} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: isCustodian ? 'rgba(106, 36, 250, 0.08)' : 'rgba(255,255,255,0.03)',
                            borderRadius: '6px', padding: '0.5rem 0.75rem',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: isCustodian ? '#6a24fa' : '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}>{c.name}</span>
                              {isCustodian && <span style={{ color: '#6a24fa', fontSize: '0.6rem', fontWeight: 600 }}>ELECTED</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem', margin: 0 }}>Votes</p>
                                <p style={{ color: '#fff', fontSize: '0.7rem', margin: 0 }}>{Math.round(parseFloat(c.totalVotePower) / 1e9).toLocaleString()}B</p>
                              </div>
                              <div style={{ textAlign: 'right', minWidth: '2.5rem' }}>
                                <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem', margin: 0 }}>Voters</p>
                                <p style={{ color: '#fff', fontSize: '0.7rem', margin: 0 }}>{c.numVoters}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
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
