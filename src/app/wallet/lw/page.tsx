'use client'

import { useState, useEffect } from 'react'
import { Suspense } from 'react'
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

function lwToNftItems(nfts: LwNft[], contract: LwContract): NftItem[] {
  return nfts.map(nft => {
    const tier = nft.attributes.find(a => {
      const k = (a.trait_type || '').toLowerCase()
      return k === 'tier' || k === 'rarity'
    })
    return {
      id: nft.id,
      name: nft.name,
      imageUrl: normalizeImageUrl(nft.image_url),
      videoUrl: nft.animation_url && isVideoUrl(nft.animation_url) ? normalizeImageUrl(nft.animation_url) : undefined,
      collection: contract.collection_name,
      description: nft.description,
      chain: contract.chain,
      rarity: tier ? String(tier.value) : undefined,
      tokenType: contract.token_type,
      externalUrl: undefined,
      attributes: nft.attributes
        .filter(a => a.trait_type && !['name', 'image', 'description', 'animation_url'].includes(a.trait_type!))
        .map(a => ({ key: a.trait_type!, value: String(a.value || '') })),
    }
  })
}

function LwWalletContent() {
  const [contracts, setContracts] = useState<LwContract[]>([])
  const [allNfts, setAllNfts] = useState<Record<number, LwNft[]>>({})
  const [selectedContract, setSelectedContract] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/lw-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: await getWalletAddresses() }),
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
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [])

  // Get wallet addresses from Supabase
  async function getWalletAddresses(): Promise<string[]> {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data: wallets } = await supabase
        .from('connected_wallets')
        .select('wallet_address')
        .eq('user_id', user.id)
      return (wallets || []).map(w => w.wallet_address)
    } catch { return [] }
  }

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
          <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>
            ← Back
          </a>
        </div>

        {loading ? (
          <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>Loading your NFTs...</p>
        ) : contracts.length === 0 ? (
          <p style={{ color: 'var(--lw-text-muted)', textAlign: 'center', padding: '3rem 0' }}>No LightningWorks NFTs found in your connected wallets.</p>
        ) : (
          <>
            {/* Collection Tabs — styled like WAX collection banners */}
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
                    onClick={() => setSelectedContract(col.id)}
                    style={{
                      position: 'relative',
                      height: '70px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--lw-purple, #6a24fa)' : '2px solid transparent',
                      backgroundColor: 'var(--lw-wallet-row-bg)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      opacity: isSelected ? 1 : 0.6,
                      transition: 'opacity 0.15s, border-color 0.15s',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
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
                <h2 className="lw-section-title">
                  {selectedContractData.collection_name} ({selectedNfts.length})
                </h2>
                <NftGrid
                  nfts={lwToNftItems(selectedNfts, selectedContractData)}
                  aspectRatio="1"
                  storageKey={`nft-tags-lw-${selectedContractData.contract_address}`}
                />
              </div>
            )}
          </>
        )}
      </div>
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
