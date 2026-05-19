'use client'

import { useState, useEffect, useCallback } from 'react'
import { Suspense } from 'react'
import { createPortal } from 'react-dom'
import { NftGrid, type NftItem } from '@/components/NftGrid'

interface LwContract {
  id: number
  chain: string
  contract_address: string
  collection_name: string
  symbol: string
  token_type: string
  icon_url: string | null
}

interface LwNft {
  id: string
  contract_id: number
  token_id: string
  name: string
  description: string | null
  image_url: string | null
  animation_url: string | null
  attributes: { trait_type?: string; value?: unknown }[]
}

function normalizeImageUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  if (url.startsWith('Qm') || url.startsWith('bafy')) return `https://ipfs.io/ipfs/${url}`
  return url
}

function isVideoUrl(url: string | null): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogv') || lower.endsWith('.mov')
}

function getTier(attrs: { trait_type?: string; value?: unknown }[]): string | null {
  const a = attrs.find(a => {
    const k = (a.trait_type || '').toLowerCase()
    return k === 'tier' || k === 'rarity'
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

function lwToNftItems(nfts: LwNft[], contract: LwContract): NftItem[] {
  return nfts.map(nft => {
    const tier = getTier(nft.attributes)
    return {
      id: `${contract.contract_address}-${nft.token_id}`,
      name: `Mint# ${nft.token_id}`,
      imageUrl: normalizeImageUrl(nft.image_url),
      videoUrl: nft.animation_url && isVideoUrl(nft.animation_url) ? normalizeImageUrl(nft.animation_url) : undefined,
      animationUrl: nft.animation_url || undefined,
      collection: contract.collection_name,
      description: nft.description,
      chain: contract.chain,
      rarity: tier || undefined,
      tokenType: contract.token_type,
      attributes: nft.attributes
        .filter(a => a.trait_type)
        .map(a => ({ key: a.trait_type!, value: String(a.value || '') })),
    }
  })
}

const CHAIN_ICONS: Record<string, string> = {
  Polygon: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/matic-network/small.png',
  Ethereum: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/ethereum/small.png',
  Base: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
  Core: 'https://scan.coredao.org/favicon.ico',
  'SKALE Nebula': 'https://green-giddy-denebola.explorer.mainnet.skalenodes.com/favicon.ico',
}

// Forge ABI
const FORGE_ABI = [
  { type: 'function', name: 'forge', stateMutability: 'nonpayable', inputs: [{ type: 'uint256[]', name: '_tokenIds' }], outputs: [] },
] as const

function LwWalletContent() {
  const [contracts, setContracts] = useState<LwContract[]>([])
  const [allNfts, setAllNfts] = useState<Record<number, LwNft[]>>({})
  const [selectedContract, setSelectedContract] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Forge state
  const [forgeMode, setForgeMode] = useState(false)
  const [forgeSelections, setForgeSelections] = useState<LwNft[]>([])
  const [forgeMessage, setForgeMessage] = useState('')
  const [forging, setForging] = useState(false)
  const [showForgeConfirm, setShowForgeConfirm] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  useEffect(() => {
    (async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'superadmin') setIsSuperadmin(true)
    })()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: wallets } = await supabase.from('connected_wallets').select('wallet_address').eq('user_id', user.id)
        const addresses = (wallets || []).map(w => w.wallet_address)
        if (addresses.length === 0) { setLoading(false); return }

        const res = await fetch('/api/lw-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses }),
        })
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        const contractList = (data.contracts || []) as LwContract[]
        setContracts(contractList)

        const nftMap: Record<number, LwNft[]> = {}
        for (const [contractId, nfts] of Object.entries(data.nfts || {})) {
          nftMap[parseInt(contractId)] = (nfts as LwNft[]).sort((a, b) => parseInt(a.token_id) - parseInt(b.token_id))
        }
        setAllNfts(nftMap)
        if (contractList.length > 0) setSelectedContract(contractList[0].id)

        // Auto-favorite Ultra Rares
        for (const contract of contractList) {
          const storageKey = `nft-tags-lw-${contract.contract_address}`
          const nfts = nftMap[contract.id] || []
          try {
            const raw = localStorage.getItem(storageKey)
            const tags = raw ? JSON.parse(raw) : { spam: [], favorite: [], hidden: [] }
            const favSet = new Set(tags.favorite || [])
            let changed = false
            for (const nft of nfts) {
              const nftId = `${contract.contract_address}-${nft.token_id}`
              if (isUltraRare(nft.attributes) && !favSet.has(nftId)) {
                favSet.add(nftId)
                changed = true
              }
            }
            if (changed) {
              tags.favorite = [...favSet]
              localStorage.setItem(storageKey, JSON.stringify(tags))
            }
          } catch { /* ignore */ }
        }
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [])

  // Escape cancels forge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
        if (showForgeConfirm) { setShowForgeConfirm(false); setForgeSelections([]); return }
        if (forgeMode) { setForgeMode(false); setForgeSelections([]) }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [forgeMode, showForgeConfirm])

  const handleForgeSelect = useCallback((nftItem: NftItem) => {
    if (!forgeMode) return

    const contract = contracts.find(c => c.id === selectedContract)
    if (!contract) return
    const nfts = allNfts[contract.id] || []
    const nft = nfts.find(n => `${contract.contract_address}-${n.token_id}` === nftItem.id)
    if (!nft) return

    const tier = getTier(nft.attributes)
    if (!tier) return

    if (forgeSelections.length === 0) {
      setForgeSelections([nft])
      setForgeMessage(`Selected #${nft.token_id} (${tier}). Select another ${tier} to forge.`)
    } else if (forgeSelections.length === 1) {
      const firstTier = getTier(forgeSelections[0].attributes)
      if (firstTier === tier && forgeSelections[0].id !== nft.id) {
        setForgeSelections([forgeSelections[0], nft])
        setShowForgeConfirm(true)
        setForgeMessage('')
      } else if (firstTier !== tier) {
        setForgeMessage(`Both must be ${firstTier}. Select another ${firstTier}.`)
        setTimeout(() => setForgeMessage(''), 3000)
      }
    } else {
      setForgeSelections([nft])
      setShowForgeConfirm(false)
      setForgeMessage(`Selected #${nft.token_id} (${tier}). Select another ${tier} to forge.`)
    }
  }, [forgeMode, forgeSelections, contracts, selectedContract, allNfts])

  const executeForge = useCallback(async () => {
    if (forgeSelections.length !== 2) return
    const contract = contracts.find(c => c.id === selectedContract)
    if (!contract) return

    setForging(true)
    setForgeMessage('Waiting for wallet approval...')

    try {
      const { createWalletClient, custom, encodeFunctionData, createPublicClient, http } = await import('viem')
      const { polygon, mainnet, base } = await import('viem/chains')

      const win = window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }
      if (!win.ethereum) { setForgeMessage('MetaMask not found'); setForging(false); return }

      const accounts = await win.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts?.[0]) { setForgeMessage('No account connected'); setForging(false); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chainMap: Record<string, any> = { Polygon: polygon, Ethereum: mainnet, Base: base }
      const chain = chainMap[contract.chain] || polygon

      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain,
        transport: custom(win.ethereum as never),
      })

      const tokenIds = forgeSelections.map(n => BigInt(n.token_id))
      setForgeMessage('Confirm the transaction in your wallet...')

      const data = encodeFunctionData({ abi: FORGE_ABI, functionName: 'forge', args: [tokenIds] })
      const hash = await walletClient.sendTransaction({ chain, to: contract.contract_address as `0x${string}`, data, gas: BigInt(150000) })

      setForgeMessage('Forging in progress...')
      const publicClient = createPublicClient({ chain, transport: http() })
      await publicClient.waitForTransactionReceipt({ hash })

      setForgeMessage('Forge complete! Refreshing...')
      setForgeSelections([])
      setForgeMode(false)
      setShowForgeConfirm(false)
      setTimeout(() => window.location.reload(), 3000)
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'ACTION_REJECTED') {
        setForgeMessage('Transaction cancelled')
      } else {
        setForgeMessage(`Forge failed: ${(err.message || '').slice(0, 80)}`)
      }
    }
    setForging(false)
    setTimeout(() => setForgeMessage(''), 6000)
  }, [forgeSelections, contracts, selectedContract])

  const selectedContractData = contracts.find(c => c.id === selectedContract)
  const selectedNfts = selectedContract ? allNfts[selectedContract] || [] : []

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '60rem', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>LightningWorks Wallet</h1>
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Your NFT collections</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selectedContractData && (
              <button
                onClick={() => { setForgeMode(!forgeMode); setForgeSelections([]); setShowForgeConfirm(false); setForgeMessage('') }}
                className="lw-btn"
                style={{
                  width: 'auto', padding: '0.5rem 1.5rem',
                  backgroundColor: forgeMode ? 'var(--lw-purple)' : '#3a3938',
                  color: forgeMode ? '#fff' : '#aaa',
                }}
              >
                {forgeMode ? 'Cancel Forge' : 'Forge'}
              </button>
            )}
            <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
              ← Back
            </a>
          </div>
        </div>

        {/* Forge message */}
        {forgeMessage && (
          <p style={{
            padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem',
            backgroundColor: forgeMessage.includes('failed') || forgeMessage.includes('cancelled') ? 'rgba(255,68,68,0.15)' : 'rgba(106,36,250,0.15)',
            color: forgeMessage.includes('failed') || forgeMessage.includes('cancelled') ? '#ff4444' : '#bab1a8',
          }}>
            {forgeMessage}
          </p>
        )}

        {forgeMode && !forgeMessage && (
          <p style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', marginBottom: '0.75rem', backgroundColor: 'rgba(106,36,250,0.1)', color: 'var(--lw-text-muted)' }}>
            Click two NFTs of the same tier to forge. Press Escape or N to cancel.
          </p>
        )}

        {loading ? (
          <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>Loading your NFTs...</p>
        ) : contracts.length === 0 ? (
          <p style={{ color: 'var(--lw-text-muted)', textAlign: 'center', padding: '3rem 0' }}>No LightningWorks NFTs found in your connected wallets.</p>
        ) : (
          <>
            {/* Collection Tabs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(contracts.length, 4)}, 1fr)`,
              gap: '0.75rem',
              marginBottom: '1rem',
            }}>
              {contracts.map(col => {
                const nftCount = allNfts[col.id]?.length || 0
                const firstImage = allNfts[col.id]?.[0]?.image_url ? normalizeImageUrl(allNfts[col.id][0].image_url) : col.icon_url
                const isSelected = selectedContract === col.id

                return (
                  <button
                    key={col.id}
                    onClick={() => { setSelectedContract(col.id); setForgeSelections([]); setShowForgeConfirm(false) }}
                    style={{
                      position: 'relative', height: '70px', borderRadius: '8px',
                      border: isSelected ? '2px solid var(--lw-purple, #6a24fa)' : '2px solid transparent',
                      backgroundColor: 'var(--lw-wallet-row-bg)',
                      cursor: 'pointer', overflow: 'hidden',
                      opacity: isSelected ? 1 : 0.6,
                      transition: 'opacity 0.15s', padding: 0,
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.opacity = '0.6' }}
                  >
                    {firstImage && (
                      <img src={firstImage} alt="" style={{ width: '60px', height: '100%', objectFit: 'cover', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <div style={{ padding: '0 0.5rem', textAlign: 'left', overflow: 'hidden' }}>
                      <p style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.collection_name}
                      </p>
                      <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: '0.15rem 0 0' }}>
                        {nftCount} owned
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* NFT Grid */}
            {selectedContractData && (
              <div className="lw-section">
                <h2 className="lw-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedContractData.collection_name}
                  <span style={{ color: 'var(--lw-text-muted)', fontWeight: 400 }}>({selectedNfts.length})</span>
                  {CHAIN_ICONS[selectedContractData.chain] && (
                    <img src={CHAIN_ICONS[selectedContractData.chain]} alt={selectedContractData.chain} style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
                  )}
                </h2>
                <NftGrid
                  nfts={lwToNftItems(selectedNfts, selectedContractData)}
                  aspectRatio="5 / 7"
                  columns={5}
                  mobileColumns={3}
                  storageKey={`nft-tags-lw-${selectedContractData.contract_address}`}
                  isSuperadmin={isSuperadmin}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Forge Confirmation Modal */}
      {showForgeConfirm && forgeSelections.length === 2 && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
          }}
          onClick={() => { setShowForgeConfirm(false); setForgeSelections([]) }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#1a1a1c', borderRadius: '16px', padding: '2rem', maxWidth: '500px', width: '100%',
            boxShadow: '0 0 15px 5px rgba(80,40,200,0.5), 0 0 40px 15px rgba(60,30,160,0.35)',
            textAlign: 'center',
          }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.3rem' }}>Forge These NFTs?</h3>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {forgeSelections.map(nft => (
                <div key={nft.id} style={{ width: '140px' }}>
                  <div style={{ width: '140px', height: '196px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#0d0d0d' }}>
                    {nft.image_url && (
                      <img src={normalizeImageUrl(nft.image_url)!} alt={nft.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                  </div>
                  <p style={{ color: '#fff', fontSize: '0.75rem', margin: '0.5rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{nft.token_id}
                  </p>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.65rem', margin: '0.15rem 0 0' }}>
                    {getTier(nft.attributes) || '?'}
                  </p>
                </div>
              ))}
            </div>

            <p style={{ color: '#bab1a8', fontSize: '0.8rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
              Token #{Math.max(parseInt(forgeSelections[0].token_id), parseInt(forgeSelections[1].token_id))} will be <strong style={{ color: '#ff4444' }}>burned</strong>.
              Token #{Math.min(parseInt(forgeSelections[0].token_id), parseInt(forgeSelections[1].token_id))} will be <strong style={{ color: '#34A853' }}>upgraded</strong>.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={executeForge}
                disabled={forging}
                className="lw-btn lw-btn-primary"
                style={{ width: 'auto', padding: '0.6rem 2rem', fontSize: '1rem' }}
              >
                {forging ? 'Forging...' : 'Forge'}
              </button>
              <button
                onClick={() => { setShowForgeConfirm(false); setForgeSelections([]) }}
                className="lw-btn"
                style={{ width: 'auto', padding: '0.6rem 2rem', fontSize: '1rem', backgroundColor: '#3a3938', color: '#aaa' }}
              >
                Cancel (N)
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default function LwWalletPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading...</p></div>}>
      <LwWalletContent />
    </Suspense>
  )
}
