'use client'

import { useState, useEffect } from 'react'
import { getAllBalances } from './balances'
import { shortenAddress } from './types'
import type { ConnectedWallet, WalletToken } from './types'

interface WalletPortfolioProps {
  savedWallets: ConnectedWallet[]
}

export function WalletPortfolio({ savedWallets }: WalletPortfolioProps) {
  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadBalances = async () => {
    if (savedWallets.length === 0) return
    setLoading(true)
    const walletInputs = savedWallets.map(w => ({ chain: w.chain, address: w.address }))
    const allTokens = await getAllBalances(walletInputs)
    setTokens(allTokens)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    if (savedWallets.length > 0) {
      loadBalances()
    }
  }, [savedWallets])

  if (savedWallets.length === 0) {
    return (
      <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
        Connect a wallet above to see your balances.
      </p>
    )
  }

  // Group tokens by wallet address
  const walletGroups: Record<string, { wallet: ConnectedWallet; tokens: WalletToken[] }> = {}
  for (const w of savedWallets) {
    walletGroups[w.address] = { wallet: w, tokens: [] }
  }
  for (const t of tokens) {
    if (walletGroups[t.walletAddress]) {
      walletGroups[t.walletAddress].tokens.push(t)
    }
  }

  const chainIcons: Record<string, string> = {
    evm: '⟠',
    solana: '◎',
    wax: '🌐',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem' }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
        </span>
        <button
          onClick={loadBalances}
          disabled={loading}
          className="lw-btn lw-btn-connect"
          style={{ width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.8rem' }}
        >
          {loading ? <span className="lw-dots">Refreshing</span> : '↻ Refresh'}
        </button>
      </div>

      {Object.entries(walletGroups).map(([address, { wallet, tokens: walletTokens }]) => (
        <div key={address} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>{chainIcons[wallet.chain] || '💰'}</span>
            <span style={{ color: 'var(--lw-text-white)', fontSize: '0.9rem', fontWeight: 500 }}>
              {wallet.provider.charAt(0).toUpperCase() + wallet.provider.slice(1)}
            </span>
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
              {shortenAddress(address, 6)}
            </span>
          </div>

          {loading && walletTokens.length === 0 ? (
            <div style={{ padding: '0.5rem 0 0.5rem 1.75rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
              <span className="lw-dots">Loading</span>
            </div>
          ) : walletTokens.length === 0 ? (
            <div style={{ padding: '0.5rem 0 0.5rem 1.75rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
              No tokens found
            </div>
          ) : (
            <div style={{ paddingLeft: '1.75rem' }}>
              {walletTokens.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--lw-text-primary)', fontSize: '0.9rem', fontWeight: 500, minWidth: '60px' }}>
                      {t.symbol}
                    </span>
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>
                      {t.name !== t.symbol ? t.name : ''}
                    </span>
                  </div>
                  <span style={{ color: 'var(--lw-text-white)', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                    {parseFloat(t.balance) > 0 ? t.balance : '0'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
