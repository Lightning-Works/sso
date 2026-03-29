'use client'

import { useState, useEffect } from 'react'

const CHAIN_ICONS: Record<string, string> = {
  Polygon: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/matic-network/small.png',
  Ethereum: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/ethereum/small.png',
  Base: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
  Core: 'https://scan.coredao.org/favicon.ico',
  'SKALE Nebula': 'https://green-giddy-denebola.explorer.mainnet.skalenodes.com/favicon.ico',
  Waterfall: 'https://waterfall.network/favicon.ico',
}

interface LwContract {
  id: number
  chain: string
  collection_name: string
  icon_url: string | null
}

interface LwWalletPanelProps {
  walletAddresses: string[]
}

export function LwWalletPanel({ walletAddresses }: LwWalletPanelProps) {
  const [contracts, setContracts] = useState<(LwContract & { count: number; firstImage: string | null })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (walletAddresses.length === 0) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/lw-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: walletAddresses }),
        })
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()

        const list = ((data.contracts || []) as LwContract[]).map(c => {
          const nfts = (data.nfts?.[c.id] || []) as { image_url?: string }[]
          const firstImg = nfts[0]?.image_url || null
          const normalized = firstImg
            ? firstImg.startsWith('ipfs://') ? firstImg.replace('ipfs://', 'https://ipfs.io/ipfs/')
            : firstImg.startsWith('Qm') ? `https://ipfs.io/ipfs/${firstImg}`
            : firstImg
            : c.icon_url
          return { ...c, count: nfts.length, firstImage: normalized }
        })

        setContracts(list)
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [walletAddresses])

  if (loading) {
    return (
      <div className="lw-section">
        <h2 className="lw-section-title">LightningWorks Wallet</h2>
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>Loading...</p>
      </div>
    )
  }

  if (contracts.length === 0) return null

  return (
    <div className="lw-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 className="lw-section-title" style={{ margin: 0 }}>LightningWorks Wallet</h2>
        <a href="/wallet/lw" className="lw-link" style={{ fontSize: '0.8rem' }}>View All →</a>
      </div>

      {contracts.map(c => (
        <a
          key={c.id}
          href="/wallet/lw"
          style={{
            backgroundColor: 'var(--lw-wallet-row-bg)',
            borderRadius: '8px',
            padding: '5px',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
            cursor: 'pointer',
            minHeight: '55px',
          }}
        >
          {c.firstImage && (
            <img
              src={c.firstImage}
              alt=""
              style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div style={{ flex: 1, padding: '0 0.75rem' }}>
            <span style={{ color: 'var(--lw-text-white)', fontWeight: 600, fontSize: '0.9rem' }}>
              {c.collection_name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '0.75rem' }}>
            <span style={{ color: 'var(--nft-accent, #ff8800)', fontSize: '0.8rem', fontWeight: 600 }}>
              {c.count}
            </span>
            {CHAIN_ICONS[c.chain] && (
              <img src={CHAIN_ICONS[c.chain]} alt={c.chain} style={{ width: '16px', height: '16px', borderRadius: '3px' }} />
            )}
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>
              {c.chain}
            </span>
          </div>
        </a>
      ))}
    </div>
  )
}
