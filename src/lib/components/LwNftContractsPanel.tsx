'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'

export interface LwNftContract {
  id?: number
  chain: string
  contract_address: string
  collection_name: string
  symbol: string
  token_type: string
  total_supply: number | null
  description: string
  metadata_base_uri: string
  icon_url: string | null
  last_synced: string | null
  nft_count: number | null
  created_at?: string
}

interface LookupResult {
  collection_name: string
  symbol: string
  token_type: string
  total_supply: number | null
  description: string
  holders_count?: string
  instance_count?: number
  icon_url?: string | null
}

function getRarityFromAttrs(attrs: { trait_type?: string; value?: unknown }[] | undefined): string | null {
  if (!attrs) return null
  for (const a of attrs) {
    const key = (a.trait_type || '').toLowerCase()
    if (key === 'rarity' || key === 'tier' || key === 'grade') {
      return String(a.value || '')
    }
  }
  return null
}

function getRarityStyle(rarity: string): { color: string; glow?: string; border?: string } {
  const r = rarity.toLowerCase().trim()
  if (r === 'common') return { color: '#c4a84a', border: '1px solid rgba(196,168,74,0.4)' }
  if (r === 'uncommon') return { color: '#4CAF50', border: '1px solid rgba(76,175,80,0.4)' }
  if (r === 'rare') return { color: '#4a9eff', border: '1px solid rgba(74,158,255,0.4)' }
  if (r === 'epic') return { color: '#a855f7', border: '1px solid rgba(168,85,247,0.5)' }
  if (r === 'legendary') return { color: '#ef4444', border: '1px solid rgba(239,68,68,0.5)' }
  if (r === 'divine') return { color: '#e0e0e0', border: '1px solid rgba(224,224,224,0.6)', glow: '0 0 8px 2px rgba(224,224,224,0.5)' }
  if (r === 'mystic') return { color: '#ff4eda', border: '1px solid rgba(255,78,218,0.6)', glow: '0 0 8px 2px rgba(255,78,218,0.5)' }
  if (r === 'rainbow') return { color: '#ff4444', border: '1px solid rgba(255,200,0,0.5)', glow: '0 0 4px 1px #ff4444, 0 0 6px 2px #ffaa00, 0 0 4px 1px #44ff44, 0 0 6px 2px #4444ff' }
  if (r === 'apocalyptic') return { color: '#ff6600', border: '1px solid rgba(255,102,0,0.6)', glow: '0 0 8px 3px rgba(255,102,0,0.6), 0 0 16px 6px rgba(255,50,0,0.3)' }
  return { color: 'var(--lw-text-muted)' }
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  if (url.startsWith('Qm') || url.startsWith('bafy')) return `https://ipfs.io/ipfs/${url}`
  return url
}

const CHAIN_OPTIONS = [
  'Ethereum', 'Polygon', 'Base', 'BSC', 'Arbitrum', 'Optimism',
  'Avalanche', 'Core', 'Waterfall', 'SKALE Nebula', 'Solana', 'WAX',
]

interface NftData {
  id: string
  token_id: string
  name: string
  description: string | null
  image_url: string | null
  animation_url: string | null
  owner: string | null
  attributes: { trait_type?: string; value?: unknown }[]
}

function ContractCard({ contract: c, syncing, onSync, onEdit, onDelete, supabase }: {
  contract: LwNftContract
  syncing: boolean
  onSync: () => void
  onEdit: () => void
  onDelete: () => void
  supabase: ReturnType<typeof createClient>
}) {
  const [expanded, setExpanded] = useState(false)
  const [nfts, setNfts] = useState<NftData[]>([])
  const [nftPage, setNftPage] = useState(0)
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [totalNfts, setTotalNfts] = useState(0)
  const [selectedNft, setSelectedNft] = useState<NftData | null>(null)
  const [collectionIcon, setCollectionIcon] = useState<string | null>(c.icon_url || null)
  const PAGE_SIZE = 100

  // Load collection icon on mount (first NFT's image)
  useEffect(() => {
    if (collectionIcon || !c.id) return
    supabase
      .from('lw_nft_data')
      .select('image_url')
      .eq('contract_id', c.id)
      .not('image_url', 'is', null)
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.image_url) {
          setCollectionIcon(normalizeImageUrl(data[0].image_url as string))
        }
      })
  }, [c.id])

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (nfts.length === 0) await loadNfts(0)
  }

  const loadNfts = async (page: number) => {
    if (!c.id) return
    setLoadingNfts(true)
    setLoadError('')
    setNftPage(page)

    // Fetch ALL token IDs to sort numerically, then pick the page
    const { data: allIds, error: idsError } = await supabase
      .from('lw_nft_data')
      .select('id, token_id')
      .eq('contract_id', c.id)

    if (idsError || !allIds) {
      setLoadError(`Failed to load: ${idsError?.message || 'unknown error'}`)
      setNfts([])
      setLoadingNfts(false)
      return
    }

    // Sort all IDs numerically
    allIds.sort((a, b) => {
      const aNum = parseInt(a.token_id, 10)
      const bNum = parseInt(b.token_id, 10)
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
      return a.token_id.localeCompare(b.token_id)
    })

    setTotalNfts(allIds.length)

    // Get the IDs for this page
    const pageIds = allIds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(r => r.id)

    if (pageIds.length === 0) {
      setNfts([])
      setLoadingNfts(false)
      return
    }

    // Fetch full data for just this page's IDs
    const { data, error } = await supabase
      .from('lw_nft_data')
      .select('id, token_id, name, description, image_url, animation_url, owner, attributes')
      .in('id', pageIds)

    if (error) {
      setLoadError(`Failed to load: ${error.message}`)
      setNfts([])
    } else {
      // Sort by the order from allIds
      const idOrder = new Map(pageIds.map((id, i) => [id, i]))
      const sorted = ((data || []) as NftData[]).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
      setNfts(sorted)

      // Use first NFT's image as collection icon if none set
      if (!collectionIcon && page === 0 && sorted.length > 0 && sorted[0].image_url) {
        setCollectionIcon(normalizeImageUrl(sorted[0].image_url))
      }
    }
    setLoadingNfts(false)
  }

  const totalPages = Math.ceil(totalNfts / PAGE_SIZE)

  return (
    <div style={{
      backgroundColor: 'var(--lw-wallet-row-bg)',
      borderRadius: '8px',
      marginBottom: '0.5rem',
      overflow: 'hidden',
    }}>
      {/* Header — clickable to expand */}
      <div
        onClick={toggleExpand}
        style={{
          padding: '5px',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          cursor: 'pointer',
          minHeight: '60px',
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {collectionIcon && (
            <img
              src={collectionIcon}
              alt=""
              style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--lw-text-white)', fontWeight: 600, fontSize: '0.95rem' }}>
              {c.collection_name || c.contract_address.slice(0, 12) + '...'}
            </span>
            {c.symbol && <span style={{ color: 'var(--nft-accent, #ff8800)', fontSize: '0.75rem' }}>${c.symbol}</span>}
            <span style={{
              backgroundColor: 'rgba(106,36,250,0.2)',
              color: 'var(--lw-purple)',
              fontSize: '0.65rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
            }}>
              {c.chain}
            </span>
            {c.token_type && <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem' }}>{c.token_type}</span>}
          </div>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0.25rem 0 0 0', fontFamily: 'monospace' }}>
            {c.contract_address}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
            {c.nft_count != null && (
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem' }}>
                {c.nft_count.toLocaleString()} NFTs cached
              </span>
            )}
            {c.last_synced && (
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem' }}>
                Last sync: {new Date(c.last_synced).toLocaleString()}
              </span>
            )}
          </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onSync() }}
            disabled={syncing}
            className="lw-btn"
            style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#2a4a2a', color: '#34A853' }}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="lw-btn"
            style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#3a3938', color: '#aaa' }}
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="lw-btn"
            style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#3a2020', color: '#ff4444' }}
          >
            Delete
          </button>
          <span style={{
            color: 'var(--lw-text-muted)',
            fontSize: '0.8rem',
            marginLeft: '0.5rem',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded NFT grid */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {loadError ? (
            <p style={{ color: '#ff4444', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>{loadError}</p>
          ) : loadingNfts ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>Loading NFTs...</p>
          ) : nfts.length === 0 ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>No NFTs cached. Click &quot;Sync Now&quot; to fetch from blockchain.</p>
          ) : (
            <>
              {/* Pagination header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0 0.5rem' }}>
                <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>
                  Showing {nftPage * PAGE_SIZE + 1}–{Math.min((nftPage + 1) * PAGE_SIZE, totalNfts)} of {totalNfts}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      onClick={() => loadNfts(nftPage - 1)}
                      disabled={nftPage === 0}
                      className="lw-btn"
                      style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3a3938', color: nftPage === 0 ? '#555' : '#aaa' }}
                    >
                      Prev
                    </button>
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', alignSelf: 'center', padding: '0 0.3rem' }}>
                      {nftPage + 1}/{totalPages}
                    </span>
                    <button
                      onClick={() => loadNfts(nftPage + 1)}
                      disabled={nftPage >= totalPages - 1}
                      className="lw-btn"
                      style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3a3938', color: nftPage >= totalPages - 1 ? '#555' : '#aaa' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* NFT grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: '0.5rem',
              }}>
                {nfts.map(nft => {
                  const rarity = getRarityFromAttrs(nft.attributes)
                  const rs = rarity ? getRarityStyle(rarity) : null
                  return (
                  <div
                    key={nft.id}
                    onClick={() => setSelectedNft(nft)}
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                      border: rs?.border || '1px solid transparent',
                      boxShadow: rs?.glow || 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{
                      width: '100%',
                      aspectRatio: '1',
                      backgroundColor: '#1a1a1c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {nft.image_url ? (
                        <img
                          src={normalizeImageUrl(nft.image_url)!}
                          alt={nft.name}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span style={{ color: '#555', fontSize: '0.6rem' }}>No image</span>
                      )}
                    </div>
                    <div style={{ padding: '0.3rem 0.4rem' }}>
                      <p style={{ color: 'var(--lw-text-white)', fontSize: '0.65rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nft.name}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem' }}>
                          #{nft.token_id}
                        </span>
                        {rarity && (
                          <span style={{ color: rs!.color, fontSize: '0.5rem', fontWeight: 600, textTransform: 'capitalize' }}>
                            {rarity}
                          </span>
                        )}
                      </div>
                      {nft.owner && (
                        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.5rem', margin: '0.1rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>

              {/* Bottom pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0.5rem 0 0', gap: '0.3rem' }}>
                  <button
                    onClick={() => loadNfts(nftPage - 1)}
                    disabled={nftPage === 0}
                    className="lw-btn"
                    style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3a3938', color: nftPage === 0 ? '#555' : '#aaa' }}
                  >
                    Prev
                  </button>
                  <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', padding: '0 0.3rem' }}>
                    {nftPage + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => loadNfts(nftPage + 1)}
                    disabled={nftPage >= totalPages - 1}
                    className="lw-btn"
                    style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.7rem', backgroundColor: '#3a3938', color: nftPage >= totalPages - 1 ? '#555' : '#aaa' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* NFT Detail Modal */}
      {selectedNft && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedNft(null) }}
        >
          <div style={{
            backgroundColor: '#1a1a1c', borderRadius: '12px',
            maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto',
            position: 'relative',
            boxShadow: '0 0 15px 5px rgba(80,40,200,0.5), 0 0 40px 15px rgba(60,30,160,0.35)',
          }}>
            <button
              onClick={() => setSelectedNft(null)}
              style={{
                position: 'sticky', top: '8px', float: 'right', marginRight: '8px',
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', zIndex: 10,
              }}
            >&#x2715;</button>

            {/* Image/Video */}
            <div style={{
              width: '100%', maxHeight: '400px', backgroundColor: '#0d0d0d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px 12px 0 0', overflow: 'hidden',
            }}>
              {selectedNft.animation_url ? (
                <video src={normalizeImageUrl(selectedNft.animation_url)!} poster={normalizeImageUrl(selectedNft.image_url) || undefined} autoPlay loop muted playsInline controls style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
              ) : selectedNft.image_url ? (
                <img src={normalizeImageUrl(selectedNft.image_url)!} alt={selectedNft.name} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#555' }}>No image</div>
              )}
            </div>

            {/* Details */}
            <div style={{ padding: '1rem' }}>
              <h3 style={{ color: '#fff', margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{selectedNft.name}</h3>
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem 0' }}>
                {c.collection_name} · #{selectedNft.token_id} · {c.chain}
              </p>

              {selectedNft.description && (
                <p style={{ color: 'var(--lw-text-secondary, #bab1a8)', fontSize: '0.8rem', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>{selectedNft.description}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0 }}>Token ID</p>
                  <p style={{ color: '#fff', fontSize: '0.8rem', margin: '0.1rem 0 0 0', fontFamily: 'monospace' }}>{selectedNft.token_id}</p>
                </div>
                {selectedNft.owner && (
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                    <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: 0 }}>Owner</p>
                    <p style={{ color: '#fff', fontSize: '0.8rem', margin: '0.1rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedNft.owner.slice(0, 8)}...{selectedNft.owner.slice(-6)}
                    </p>
                  </div>
                )}
              </div>

              {/* Attributes */}
              {selectedNft.attributes && selectedNft.attributes.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', marginBottom: '0.4rem' }}>Attributes</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {selectedNft.attributes.map((a, i) => (
                      <div key={i} style={{ backgroundColor: 'rgba(106,36,250,0.15)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                        <span style={{ color: 'var(--lw-text-muted)' }}>{a.trait_type || 'key'}: </span>
                        <span style={{ color: '#fff' }}>{String(a.value || '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export function LwNftContractsPanel() {
  const [contracts, setContracts] = useState<LwNftContract[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<LwNftContract | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [syncing, setSyncing] = useState<number | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadContracts() }, [])

  const showMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 5000)
  }

  const loadContracts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('lw_nft_contracts')
      .select('*')
      .order('chain', { ascending: true })
    setContracts(data || [])
    setLoading(false)
  }

  const saveContract = async (contract: LwNftContract) => {
    if (!contract.contract_address || !contract.chain) {
      showMsg('Chain and contract address are required', 'error')
      return
    }

    const payload = {
      chain: contract.chain,
      contract_address: contract.contract_address,
      collection_name: contract.collection_name,
      symbol: contract.symbol,
      token_type: contract.token_type,
      total_supply: contract.total_supply,
      description: contract.description,
      metadata_base_uri: contract.metadata_base_uri,
      icon_url: contract.icon_url,
    }

    if (contract.id) {
      const { error } = await supabase.from('lw_nft_contracts').update(payload).eq('id', contract.id)
      if (error) { showMsg(`Error: ${error.message}`, 'error'); return }
    } else {
      const { error } = await supabase.from('lw_nft_contracts').insert(payload)
      if (error) { showMsg(`Error: ${error.message}`, 'error'); return }
    }

    setEditing(null)
    setShowNew(false)
    showMsg('Contract saved')
    loadContracts()
  }

  const deleteContract = async (id: number) => {
    if (!confirm('Delete this contract and all its cached NFT data?')) return
    await supabase.from('lw_nft_contracts').delete().eq('id', id)
    loadContracts()
  }

  const syncContract = async (contract: LwNftContract) => {
    if (!contract.id) return
    setSyncing(contract.id)
    try {
      const res = await fetch('/api/admin/sync-lw-nfts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contract.id }),
      })
      const data = await res.json()
      if (data.error) {
        showMsg(`Sync error: ${data.error}`, 'error')
      } else {
        showMsg(`Synced ${data.nft_count} NFTs for ${contract.collection_name || contract.contract_address}`)
        loadContracts()
      }
    } catch (e) {
      showMsg(`Sync failed: ${(e as Error).message}`, 'error')
    }
    setSyncing(null)
  }

  const emptyContract: LwNftContract = {
    chain: 'Ethereum',
    contract_address: '',
    collection_name: '',
    symbol: '',
    token_type: '',
    total_supply: null,
    description: '',
    metadata_base_uri: '',
    icon_url: null,
    last_synced: null,
    nft_count: null,
  }

  const ContractForm = ({ contract, onSave, onCancel }: { contract: LwNftContract; onSave: (c: LwNftContract) => void; onCancel: () => void }) => {
    const [form, setForm] = useState(contract)
    const [looking, setLooking] = useState(false)
    const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
    const [lookupError, setLookupError] = useState('')
    const isEditing = !!contract.id
    const hasResult = !!lookupResult || isEditing

    const lookupContract = async () => {
      if (!form.contract_address || !form.chain) {
        setLookupError('Enter chain and contract address first')
        return
      }
      setLooking(true)
      setLookupError('')
      setLookupResult(null)
      try {
        const res = await fetch('/api/admin/lookup-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: form.chain, address: form.contract_address }),
        })
        const data = await res.json()
        if (data.error) {
          setLookupError(data.error)
        } else if (!data.collection_name && !data.symbol) {
          setLookupError('Contract found but no metadata available')
        } else {
          setLookupResult(data)
          setForm(prev => ({
            ...prev,
            collection_name: data.collection_name || prev.collection_name,
            symbol: data.symbol || prev.symbol,
            token_type: data.token_type || prev.token_type,
            total_supply: data.total_supply ?? prev.total_supply,
            description: data.description || prev.description,
            icon_url: data.icon_url || prev.icon_url,
          }))
        }
      } catch {
        setLookupError('Network error — could not reach the blockchain')
      }
      setLooking(false)
    }

    const disabledStyle = {
      opacity: hasResult ? 1 : 0.35,
      pointerEvents: hasResult ? 'auto' as const : 'none' as const,
    }

    return (
      <div style={{ backgroundColor: 'rgba(106,36,250,0.08)', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' }}>
        {/* Step 1: Chain + Address + Lookup */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Chain *</label>
            <select
              value={form.chain}
              onChange={e => { setForm({ ...form, chain: e.target.value }); setLookupResult(null); setLookupError('') }}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
            >
              {CHAIN_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Contract Address *</label>
            <input
              value={form.contract_address}
              onChange={e => { setForm({ ...form, contract_address: e.target.value }); setLookupResult(null); setLookupError('') }}
              className="lw-input"
              placeholder="0x... or WAX collection name or Solana address"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', fontFamily: 'monospace' }}
            />
          </div>
          <button
            onClick={lookupContract}
            disabled={looking || !form.contract_address}
            className="lw-btn lw-btn-primary"
            style={{ width: 'auto', padding: '0.4rem 1.25rem', fontSize: '0.8rem', whiteSpace: 'nowrap', height: 'fit-content' }}
          >
            {looking ? 'Looking up...' : 'Lookup'}
          </button>
        </div>

        {/* Lookup error */}
        {lookupError && (
          <p style={{ color: '#ff4444', fontSize: '0.8rem', margin: '0.5rem 0 0 0', padding: '0.4rem 0.75rem', backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: '4px' }}>
            {lookupError}
          </p>
        )}

        {/* Lookup result confirmation */}
        {lookupResult && !isEditing && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'rgba(52,168,83,0.1)', borderRadius: '6px', border: '1px solid rgba(52,168,83,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              {lookupResult.icon_url && (
                <img src={lookupResult.icon_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '6px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
              <p style={{ color: '#34A853', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Contract found on {form.chain}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--lw-text-muted)' }}>Name:</span>
              <span style={{ color: 'var(--lw-text-white)', fontWeight: 500 }}>{lookupResult.collection_name || '—'}</span>
              <span style={{ color: 'var(--lw-text-muted)' }}>Symbol:</span>
              <span style={{ color: 'var(--nft-accent, #ff8800)' }}>{lookupResult.symbol ? `$${lookupResult.symbol}` : '—'}</span>
              <span style={{ color: 'var(--lw-text-muted)' }}>Type:</span>
              <span style={{ color: 'var(--lw-text-white)' }}>{lookupResult.token_type || '—'}</span>
              {lookupResult.total_supply != null && lookupResult.total_supply > 0 && (
                <>
                  <span style={{ color: 'var(--lw-text-muted)' }}>Supply:</span>
                  <span style={{ color: 'var(--lw-text-white)' }}>{lookupResult.total_supply.toLocaleString()}</span>
                </>
              )}
              {lookupResult.holders_count && (
                <>
                  <span style={{ color: 'var(--lw-text-muted)' }}>Holders:</span>
                  <span style={{ color: 'var(--lw-text-white)' }}>{lookupResult.holders_count}</span>
                </>
              )}
              {lookupResult.instance_count != null && lookupResult.instance_count > 0 && (
                <>
                  <span style={{ color: 'var(--lw-text-muted)' }}>NFTs indexed:</span>
                  <span style={{ color: 'var(--lw-text-white)' }}>{lookupResult.instance_count}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Editable fields (greyed out until lookup succeeds) */}
        <div style={{ ...disabledStyle, marginTop: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Collection Name</label>
              <input
                value={form.collection_name}
                onChange={e => setForm({ ...form, collection_name: e.target.value })}
                className="lw-input"
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Symbol</label>
              <input
                value={form.symbol}
                onChange={e => setForm({ ...form, symbol: e.target.value })}
                className="lw-input"
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Token Type</label>
              <input
                value={form.token_type}
                onChange={e => setForm({ ...form, token_type: e.target.value })}
                className="lw-input"
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Total Supply</label>
              <input
                type="number"
                value={form.total_supply || ''}
                onChange={e => setForm({ ...form, total_supply: e.target.value ? parseInt(e.target.value) : null })}
                className="lw-input"
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="lw-input"
                rows={2}
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', resize: 'vertical' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Metadata Base URI</label>
              <input
                value={form.metadata_base_uri}
                onChange={e => setForm({ ...form, metadata_base_uri: e.target.value })}
                className="lw-input"
                placeholder="https://..."
                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            onClick={() => onSave(form)}
            disabled={!hasResult}
            className="lw-btn lw-btn-primary"
            style={{ width: 'auto', padding: '0.4rem 1.5rem', opacity: hasResult ? 1 : 0.4 }}
          >
            {isEditing ? 'Save Changes' : 'Add Contract'}
          </button>
          <button onClick={onCancel} className="lw-btn" style={{ width: 'auto', padding: '0.4rem 1.5rem', backgroundColor: '#3a3938', color: '#aaa' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <p style={{ color: 'var(--lw-text-muted)' }}>Loading contracts...</p>

  return (
    <div>
      {message && <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: messageType === 'error' ? '#ff4444' : '#34A853' }}>{message}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem', margin: 0 }}>
          {contracts.length} contract{contracts.length !== 1 ? 's' : ''} registered
        </p>
        {!showNew && (
          <button onClick={() => { setShowNew(true); setEditing(null) }} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.4rem 1.5rem' }}>
            + Add Contract
          </button>
        )}
      </div>

      {showNew && (
        <ContractForm
          contract={emptyContract}
          onSave={saveContract}
          onCancel={() => setShowNew(false)}
        />
      )}

      {editing && (
        <ContractForm
          contract={editing}
          onSave={saveContract}
          onCancel={() => setEditing(null)}
        />
      )}

      {contracts.map(c => (
        <ContractCard
          key={c.id}
          contract={c}
          syncing={syncing === c.id}
          onSync={() => syncContract(c)}
          onEdit={() => { setEditing(c); setShowNew(false) }}
          onDelete={() => deleteContract(c.id!)}
          supabase={supabase}
        />
      ))}
    </div>
  )
}
