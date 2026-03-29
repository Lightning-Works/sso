'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'

interface LwNft {
  id: string
  contract_id: number
  token_id: string
  name: string
  description: string | null
  image_url: string | null
  animation_url: string | null
  attributes: { trait_type?: string; value?: unknown }[]
  owner: string | null
}

interface LwContract {
  id: number
  chain: string
  contract_address: string
  collection_name: string
  symbol: string
  token_type: string
  icon_url: string | null
  nft_count: number | null
}

function normalizeImageUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  if (url.startsWith('Qm') || url.startsWith('bafy')) return `https://ipfs.io/ipfs/${url}`
  return url
}

function getTier(attrs: { trait_type?: string; value?: unknown }[]): string | null {
  const a = attrs.find(a => {
    const k = (a.trait_type || '').toLowerCase()
    return k === 'tier' || k === 'rarity' || k === 'grade'
  })
  return a ? String(a.value || '') : null
}

function isUltraRare(attrs: { trait_type?: string; value?: unknown }[]): boolean {
  return attrs.some(a => {
    const k = (a.trait_type || '').toLowerCase()
    if (k !== 'ultra rare cover' && k !== 'ultra rare') return false
    const v = String(a.value || '').toLowerCase()
    return v && v !== 'no' && v !== 'none' && v !== 'false'
  })
}

function getRarityStyle(rarity: string): { color: string; border: string; glow?: string } {
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
  return { color: 'var(--lw-text-muted)', border: '1px solid transparent' }
}

function isVideoUrl(url: string | null): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogv') || lower.endsWith('.mov')
}

// Forge ABI - just the forge function
const FORGE_ABI = [
  { type: 'function', name: 'forge', stateMutability: 'nonpayable', inputs: [{ type: 'uint256[]', name: '_tokenIds' }], outputs: [] },
]

interface LwWalletPanelProps {
  walletAddresses: string[]
}

export function LwWalletPanel({ walletAddresses }: LwWalletPanelProps) {
  const supabase = useMemo(() => createClient(), [])
  const [contracts, setContracts] = useState<LwContract[]>([])
  const [userNfts, setUserNfts] = useState<Record<number, LwNft[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedContract, setExpandedContract] = useState<number | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [selectedNft, setSelectedNft] = useState<LwNft | null>(null)

  // Forge state
  const [forgeMode, setForgeMode] = useState(false)
  const [forgeSelections, setForgeSelections] = useState<LwNft[]>([])
  const [forging, setForging] = useState(false)
  const [forgeMessage, setForgeMessage] = useState('')

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lw-wallet-favorites')
      if (saved) setFavorites(new Set(JSON.parse(saved)))
    } catch { /* ignore */ }
  }, [])

  const saveFavorite = (nftId: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(nftId) ? next.delete(nftId) : next.add(nftId)
      localStorage.setItem('lw-wallet-favorites', JSON.stringify([...next]))
      return next
    })
  }

  // Load contracts and user's NFTs
  useEffect(() => {
    if (walletAddresses.length === 0) return
    const load = async () => {
      setLoading(true)

      // Get all LW contracts
      const { data: allContracts } = await supabase
        .from('lw_nft_contracts')
        .select('id, chain, contract_address, collection_name, symbol, token_type, icon_url, nft_count')
        .order('collection_name')
      if (!allContracts) { setLoading(false); return }

      // For each contract, check if user owns any NFTs
      const lowerAddresses = walletAddresses.map(a => a.toLowerCase())
      const owned: Record<number, LwNft[]> = {}
      const contractsWithNfts: LwContract[] = []

      for (const contract of allContracts) {
        const { data: nfts } = await supabase
          .from('lw_nft_data')
          .select('id, contract_id, token_id, name, description, image_url, animation_url, attributes, owner')
          .eq('contract_id', contract.id)
          .in('owner', lowerAddresses)
          .order('token_id')

        if (nfts && nfts.length > 0) {
          owned[contract.id] = nfts as LwNft[]
          contractsWithNfts.push(contract as LwContract)
        }
      }

      setContracts(contractsWithNfts)
      setUserNfts(owned)
      setLoading(false)
    }
    load()
  }, [walletAddresses, supabase])

  const handleForgeSelect = (nft: LwNft) => {
    if (!forgeMode) return
    if (favorites.has(nft.id)) return // Can't forge favorites

    const tier = getTier(nft.attributes)
    if (!tier) return

    if (forgeSelections.length === 0) {
      setForgeSelections([nft])
    } else if (forgeSelections.length === 1) {
      const firstTier = getTier(forgeSelections[0].attributes)
      if (firstTier === tier && forgeSelections[0].id !== nft.id) {
        setForgeSelections([forgeSelections[0], nft])
      } else if (firstTier !== tier) {
        setForgeMessage('Both NFTs must be the same tier to forge')
        setTimeout(() => setForgeMessage(''), 3000)
      }
    } else {
      // Reset selection
      setForgeSelections([nft])
    }
  }

  const executeForge = useCallback(async () => {
    if (forgeSelections.length !== 2) return
    const contract = contracts.find(c => c.id === forgeSelections[0].contract_id)
    if (!contract) return

    setForging(true)
    setForgeMessage('Waiting for wallet approval...')

    try {
      const { createWalletClient, custom, encodeFunctionData } = await import('viem')
      const { polygon } = await import('viem/chains')

      const win = window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }
      if (!win.ethereum) {
        setForgeMessage('MetaMask not found. Please install MetaMask.')
        setForging(false)
        return
      }

      // Request account access
      const accounts = await win.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts || accounts.length === 0) {
        setForgeMessage('No account connected')
        setForging(false)
        return
      }

      // Determine which chain to use
      const chainMap: Record<string, unknown> = { Polygon: polygon }
      const chain = chainMap[contract.chain] || polygon

      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: chain as typeof polygon,
        transport: custom(win.ethereum as never),
      })

      const tokenIds = forgeSelections.map(n => BigInt(n.token_id))
      setForgeMessage('Confirm the transaction in MetaMask...')

      const data = encodeFunctionData({
        abi: FORGE_ABI,
        functionName: 'forge',
        args: [tokenIds],
      })

      const hash = await walletClient.sendTransaction({
        to: contract.contract_address as `0x${string}`,
        data,
        gas: BigInt(150000),
      })

      setForgeMessage('Forging in progress...')

      // Wait for confirmation
      const { createPublicClient, http } = await import('viem')
      const publicClient = createPublicClient({ chain: chain as typeof polygon, transport: http() })
      await publicClient.waitForTransactionReceipt({ hash })
      setForgeMessage('Forge complete! The NFT will be updated shortly.')
      setForgeSelections([])
      setForgeMode(false)

      // Re-load NFTs after a delay for blockchain to update
      setTimeout(() => {
        window.location.reload()
      }, 5000)
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string }
      if (err.code === 'ACTION_REJECTED') {
        setForgeMessage('Transaction rejected by user')
      } else {
        setForgeMessage(`Forge failed: ${err.message?.slice(0, 100) || 'Unknown error'}`)
      }
    }
    setForging(false)
    setTimeout(() => setForgeMessage(''), 8000)
  }, [forgeSelections, contracts])

  if (loading) {
    return (
      <div className="lw-section">
        <h2 className="lw-section-title">LightningWorks Wallet</h2>
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>Loading your NFTs...</p>
      </div>
    )
  }

  if (contracts.length === 0) {
    return null // Don't show section if user has no LW NFTs
  }

  return (
    <div className="lw-section">
      <h2 className="lw-section-title">LightningWorks Wallet</h2>

      {forgeMessage && (
        <p style={{
          padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem',
          backgroundColor: forgeMessage.includes('failed') || forgeMessage.includes('rejected') ? 'rgba(255,68,68,0.15)' : 'rgba(106,36,250,0.15)',
          color: forgeMessage.includes('failed') || forgeMessage.includes('rejected') ? '#ff4444' : '#bab1a8',
        }}>
          {forgeMessage}
        </p>
      )}

      {contracts.map(contract => {
        const nfts = userNfts[contract.id] || []
        const isExpanded = expandedContract === contract.id
        const firstImage = nfts[0]?.image_url ? normalizeImageUrl(nfts[0].image_url) : contract.icon_url

        return (
          <div key={contract.id} style={{
            backgroundColor: 'var(--lw-wallet-row-bg)',
            borderRadius: '8px',
            marginBottom: '0.5rem',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div
              onClick={() => { setExpandedContract(isExpanded ? null : contract.id); setForgeMode(false); setForgeSelections([]) }}
              style={{ padding: '5px', display: 'flex', alignItems: 'center', cursor: 'pointer', minHeight: '60px' }}
            >
              {firstImage && (
                <img src={firstImage} alt="" style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
              <div style={{ flex: 1, padding: '0 0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--lw-text-white)', fontWeight: 600 }}>{contract.collection_name}</span>
                  <span style={{ color: 'var(--nft-accent, #ff8800)', fontSize: '0.75rem' }}>{nfts.length} owned</span>
                  <span style={{ backgroundColor: 'rgba(106,36,250,0.2)', color: 'var(--lw-purple)', fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {contract.chain}
                  </span>
                </div>
              </div>
              <span style={{
                color: 'var(--lw-text-muted)', fontSize: '0.8rem', padding: '0 0.75rem',
                transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block',
              }}>▼</span>
            </div>

            {/* Expanded NFT grid */}
            {isExpanded && (
              <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {/* Forge toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                  <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>{nfts.length} NFTs</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setForgeMode(!forgeMode); setForgeSelections([]) }}
                    className="lw-btn"
                    style={{
                      width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.7rem',
                      backgroundColor: forgeMode ? 'var(--lw-purple)' : '#3a3938',
                      color: forgeMode ? '#fff' : '#aaa',
                    }}
                  >
                    {forgeMode ? 'Cancel Forge' : 'Forge Mode'}
                  </button>
                </div>

                {forgeMode && (
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0 0 0.5rem', padding: '0.4rem 0.6rem', backgroundColor: 'rgba(106,36,250,0.1)', borderRadius: '4px' }}>
                    Select two NFTs of the same tier to forge. The higher mint # will be burned and the other upgrades. Favorites cannot be forged.
                  </p>
                )}

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '0.5rem',
                }}>
                  {/* Sort: favorites first, then by token ID */}
                  {[...nfts].sort((a, b) => {
                    const aFav = favorites.has(a.id) ? 0 : 1
                    const bFav = favorites.has(b.id) ? 0 : 1
                    if (aFav !== bFav) return aFav - bFav
                    return parseInt(a.token_id) - parseInt(b.token_id)
                  }).map(nft => {
                    const tier = getTier(nft.attributes)
                    const rs = tier ? getRarityStyle(tier) : null
                    const ur = isUltraRare(nft.attributes)
                    const isFav = favorites.has(nft.id)
                    const isForgeSelected = forgeSelections.some(s => s.id === nft.id)
                    const forgeEligible = forgeMode && !isFav && tier
                    const isEnlarged = isForgeSelected && forgeSelections.length === 2

                    return (
                      <div
                        key={nft.id}
                        onClick={() => {
                          if (forgeMode) {
                            handleForgeSelect(nft)
                          } else {
                            setSelectedNft(nft)
                          }
                        }}
                        onDoubleClick={() => saveFavorite(nft.id)}
                        style={{
                          backgroundColor: ur ? '#f0f0f0' : 'rgba(0,0,0,0.2)',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'transform 0.2s',
                          border: isForgeSelected ? '2px solid var(--lw-purple)' : ur ? '2px solid gold' : rs?.border || '1px solid transparent',
                          boxShadow: isForgeSelected ? '0 0 12px 3px rgba(106,36,250,0.5)' : ur ? '0 0 12px 3px rgba(255,215,0,0.5)' : rs?.glow || 'none',
                          transform: isEnlarged ? 'scale(1.3)' : 'scale(1)',
                          zIndex: isEnlarged ? 10 : 1,
                          position: isEnlarged ? 'relative' as const : 'static' as const,
                          opacity: forgeMode && isFav ? 0.3 : 1,
                        }}
                      >
                        {/* Favorite heart */}
                        {isFav && (
                          <span style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 2, fontSize: '0.8rem', color: '#ff3355', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}>&#9829;</span>
                        )}

                        {/* Forge overlay */}
                        {isEnlarged && (
                          <div style={{
                            position: 'absolute', inset: 0, zIndex: 5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                          }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); executeForge() }}
                              disabled={forging}
                              className="lw-btn lw-btn-primary"
                              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                            >
                              {forging ? 'Forging...' : 'Forge?'}
                            </button>
                          </div>
                        )}

                        <div style={{
                          width: '100%', aspectRatio: '1',
                          backgroundColor: '#1a1a1c',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', position: 'relative',
                        }}>
                          {nft.image_url ? (
                            <img src={normalizeImageUrl(nft.image_url)!} alt={nft.name} loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <span style={{ color: '#555', fontSize: '0.6rem' }}>No image</span>
                          )}
                        </div>
                        <div style={{ padding: '0.3rem 0.4rem' }}>
                          <p style={{ color: ur ? '#111' : 'var(--lw-text-white)', fontSize: '0.65rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: ur ? 700 : 400 }}>
                            {nft.name}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: ur ? '#555' : 'var(--lw-text-muted)', fontSize: '0.55rem' }}>#{nft.token_id}</span>
                            {ur ? (
                              <span style={{ color: '#b8860b', fontSize: '0.5rem', fontWeight: 700 }}>ULTRA RARE</span>
                            ) : tier && (
                              <span style={{ color: rs!.color, fontSize: '0.5rem', fontWeight: 600 }}>{tier}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* NFT Detail Modal */}
      {selectedNft && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedNft(null) }}
        >
          <div style={{
            backgroundColor: '#1a1a1c', borderRadius: '12px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto', position: 'relative',
            boxShadow: '0 0 15px 5px rgba(80,40,200,0.5), 0 0 40px 15px rgba(60,30,160,0.35)',
          }}>
            <button onClick={() => setSelectedNft(null)} style={{
              position: 'sticky', top: '8px', float: 'right', marginRight: '8px',
              background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
              width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', zIndex: 10,
            }}>&#x2715;</button>

            <div style={{ width: '100%', maxHeight: '400px', backgroundColor: '#0d0d0d', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
              {selectedNft.animation_url && isVideoUrl(selectedNft.animation_url) ? (
                <video src={normalizeImageUrl(selectedNft.animation_url)!} poster={normalizeImageUrl(selectedNft.image_url) || undefined} autoPlay loop muted playsInline controls style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
              ) : selectedNft.image_url ? (
                <img src={normalizeImageUrl(selectedNft.image_url)!} alt={selectedNft.name} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#555' }}>No image</div>
              )}
            </div>

            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: '#fff', margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{selectedNft.name}</h3>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', margin: 0 }}>#{selectedNft.token_id}</p>
                </div>
                <button onClick={() => saveFavorite(selectedNft.id)} style={{
                  background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer',
                  color: favorites.has(selectedNft.id) ? '#ff3355' : '#555',
                }}>&#9829;</button>
              </div>

              {selectedNft.description && (
                <p style={{ color: 'var(--lw-text-secondary, #bab1a8)', fontSize: '0.8rem', margin: '0.5rem 0', lineHeight: 1.5 }}>
                  {selectedNft.description.slice(0, 200)}{selectedNft.description.length > 200 ? '...' : ''}
                </p>
              )}

              {selectedNft.attributes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                  {selectedNft.attributes.slice(0, 20).map((a, i) => {
                    const tier = (a.trait_type || '').toLowerCase() === 'tier' || (a.trait_type || '').toLowerCase() === 'rarity'
                    return (
                      <div key={i} style={{
                        backgroundColor: tier ? 'rgba(106,36,250,0.2)' : 'rgba(106,36,250,0.1)',
                        padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem',
                      }}>
                        <span style={{ color: 'var(--lw-text-muted)' }}>{a.trait_type}: </span>
                        <span style={{ color: tier ? getRarityStyle(String(a.value)).color : '#fff', fontWeight: tier ? 600 : 400 }}>{String(a.value)}</span>
                      </div>
                    )
                  })}
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
