'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { connectWaxWallet } from './wax'
import { shortenAddress } from './types'
import type { ConnectedWallet, WalletToken } from './types'
import { getBalancesForAddress } from './balances'
import { getTokenPrices, getTokenPrice, formatUsd } from './balances/prices'

interface WalletConnectPanelProps {
  userId: string
  savedWallets: ConnectedWallet[]
  onWalletSaved: () => void
}

// Click sound
const playClick = () => {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.1
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.08)
  } catch { /* audio not available */ }
}

export function WalletConnectPanel({ userId, savedWallets, onWalletSaved }: WalletConnectPanelProps) {
  const [saving, setSaving] = useState('')
  const [connecting, setConnecting] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()

  const ConnectBtn = ({ id, onClick, label }: { id: string, onClick: () => void, label?: string }) => {
    const isWorking = connecting === id || saving === id
    return (
      <button
        onClick={() => { playClick(); setConnecting(id); onClick() }}
        className={`lw-btn lw-btn-connect${isWorking ? ' working' : ''}`}
        style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem' }}
        disabled={isWorking}
      >
        {isWorking ? <span className="lw-dots">Working</span> : (label || 'Connect')}
      </button>
    )
  }

  // EVM state
  const { address: evmAddress, addresses: evmAddresses, chainId, isConnected: evmConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect: evmDisconnect } = useDisconnect()

  // Solana state
  const { publicKey, connect: solConnect, disconnect: solDisconnect, wallets, select } = useWallet()

  const saveWallet = useCallback(async (wallet: ConnectedWallet) => {
    setSaving(wallet.provider)
    setError('')
    try {
      const { error: err } = await supabase.from('connected_wallets').upsert({
        user_id: userId,
        chain_type: wallet.chain,
        wallet_provider: wallet.provider,
        wallet_address: wallet.address,
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,wallet_address'
      })
      if (err) throw err
      onWalletSaved()
    } catch (e: unknown) {
      setError('Failed to save wallet: ' + (e instanceof Error ? e.message : String(e)))
    }
    setSaving('')
  }, [userId, supabase, onWalletSaved])

  const isWalletSaved = (address: string) => {
    return savedWallets.some(w => w.address.toLowerCase() === address.toLowerCase())
  }

  // === EVM (MetaMask) ===
  const handleMetaMask = async () => {
    const metamaskConnector = connectors.find(c => c.name === 'MetaMask')
    if (metamaskConnector) {
      connect({ connector: metamaskConnector }, { onSettled: () => setConnecting('') })
    }
  }

  const handleSaveEvm = async () => {
    const addresses = evmAddresses || (evmAddress ? [evmAddress] : [])
    if (addresses.length > 0 && chainId) {
      for (const addr of addresses) {
        await saveWallet({
          chain: 'evm',
          provider: 'metamask',
          address: addr,
          displayAddress: shortenAddress(addr),
          chainId,
          chainName: chainId === 1 ? 'Ethereum' : chainId === 137 ? 'Polygon' : `Chain ${chainId}`,
        })
      }
      setConnecting('')
    }
  }

  // === Solana (Phantom / Solflare) ===
  const handleSolanaConnect = async (walletName: string) => {
    const wallet = wallets.find(w => w.adapter.name.toLowerCase() === walletName.toLowerCase())
    if (wallet) {
      select(wallet.adapter.name)
      try {
        await solConnect()
      } catch (e) {
        console.error('Solana connect error:', e)
      }
    }
    setConnecting('')
  }

  const handleSaveSolana = async (provider: string) => {
    if (publicKey) {
      await saveWallet({
        chain: 'solana',
        provider,
        address: publicKey.toBase58(),
        displayAddress: shortenAddress(publicKey.toBase58()),
        chainName: 'Solana',
      })
      setConnecting('')
    }
  }

  // === WAX ===
  const handleWaxConnect = async () => {
    const wallet = await connectWaxWallet()
    if (wallet) {
      await saveWallet(wallet)
    }
    setConnecting('')
  }

  // Expandable panels
  const [expanded, setExpanded] = useState<string | null>(null)
  const [walletBalances, setWalletBalances] = useState<Record<string, WalletToken[]>>({})
  const [loadingBalances, setLoadingBalances] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>({})

  useEffect(() => {
    getTokenPrices().then(setPrices)
  }, [])

  const toggleExpand = async (walletId: string, address: string, chain: 'evm' | 'solana' | 'wax') => {
    if (expanded === walletId) {
      setExpanded(null)
      return
    }
    setExpanded(walletId)
    if (!walletBalances[address]) {
      setLoadingBalances(walletId)
      const balances = await getBalancesForAddress(chain, address)
      setWalletBalances(prev => ({ ...prev, [address]: balances }))
      const freshPrices = await getTokenPrices()
      setPrices(freshPrices)
      setLoadingBalances(null)
    }
  }

  const BalancePanel = ({ address, chain }: { address: string, chain: string }) => {
    const tokens = walletBalances[address]
    const [tokenPrices, setTokenPrices] = useState<Record<string, number | null>>({})

    useEffect(() => {
      if (!tokens) return
      // Look up prices for tokens not in the main price cache
      const lookupPrices = async () => {
        const newPrices: Record<string, number | null> = {}
        for (const t of tokens) {
          const bal = parseFloat(t.balance)
          if (bal <= 0) continue
          if (prices[t.symbol]) continue // Already have price
          if (tokenPrices[t.address || t.symbol] !== undefined) continue // Already looked up
          const price = await getTokenPrice(t.symbol, t.address || undefined, chain)
          newPrices[t.address || t.symbol] = price
        }
        if (Object.keys(newPrices).length > 0) {
          setTokenPrices(prev => ({ ...prev, ...newPrices }))
        }
      }
      lookupPrices()
    }, [tokens])

    if (!tokens) {
      return <div style={{ padding: '0.5rem 0 0.5rem 2.5rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}><span className="lw-dots">Loading</span></div>
    }
    if (tokens.length === 0) {
      return <div style={{ padding: '0.5rem 0 0.5rem 2.5rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No tokens found</div>
    }
    return (
      <div style={{ padding: '0.25rem 0 0.5rem 2.5rem' }}>
        {tokens.map((t, i) => {
          const bal = parseFloat(t.balance)
          const price = prices[t.symbol] || tokenPrices[t.address || t.symbol] || null
          const usdValue = bal > 0 && price ? bal * price : null
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--lw-text-primary)', fontSize: '0.85rem', fontWeight: 500, minWidth: '55px' }}>{t.symbol}</span>
                <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>{t.name !== t.symbol ? t.name : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{bal > 0 ? t.balance : '0'}</span>
                {usdValue !== null && (
                  <span style={{ color: '#aaa', fontSize: '0.75rem', minWidth: '65px', textAlign: 'right' }}>[{formatUsd(usdValue)}]</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Find saved wallets by provider
  const getSavedForProvider = (provider: string) => savedWallets.filter(w => w.provider === provider)

  const WalletRow = ({ id, name, icon, provider, chain, isSaved, onConnect, onSave, addresses }: {
    id: string, name: string, icon: React.ReactNode, provider: string, chain: 'evm' | 'solana' | 'wax',
    isSaved: boolean, onConnect: () => void, onSave?: () => void, addresses: string[]
  }) => {
    const saved = getSavedForProvider(provider)
    const hasBalances = saved.length > 0
    const isExpanded = expanded === id

    return (
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div
          className="lw-row"
          style={{ padding: '0.75rem 0', cursor: hasBalances ? 'pointer' : 'default' }}
          onClick={() => hasBalances && saved[0] && toggleExpand(id, saved[0].address, chain)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {icon}
            <div>
              <span className="lw-row-value">{name}</span>
              {addresses.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  {addresses.map(addr => (
                    <p key={addr} style={{ color: isWalletSaved(addr) ? 'var(--lw-success)' : 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '1px 0', fontFamily: 'monospace' }}>
                      {isWalletSaved(addr) ? '✓ ' : ''}{shortenAddress(addr)}
                    </p>
                  ))}
                </div>
              )}
              {saved.length > 0 && addresses.length === 0 && (
                <div style={{ marginTop: '2px' }}>
                  {saved.map(w => (
                    <p key={w.address} style={{ color: 'var(--lw-success)', fontSize: '0.7rem', margin: '1px 0', fontFamily: 'monospace' }}>
                      ✓ {w.displayAddress}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }} onClick={e => e.stopPropagation()}>
            {isSaved ? (
              <span className="lw-connected">✓ Saved</span>
            ) : onSave ? (
              <ConnectBtn id={`${id}-save`} onClick={onSave} label="Save" />
            ) : (
              <ConnectBtn id={id} onClick={onConnect} />
            )}
            <span
              style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', cursor: hasBalances ? 'pointer' : 'default', width: '1.5rem', textAlign: 'center', flexShrink: 0 }}
              onClick={() => hasBalances && saved[0] && toggleExpand(id, saved[0].address, chain)}
            >
              {hasBalances ? (isExpanded ? '▲' : '▼') : ''}
            </span>
          </div>
        </div>
        {isExpanded && saved[0] && (
          loadingBalances === id ? (
            <div style={{ padding: '0.5rem 0 0.5rem 2.5rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}><span className="lw-dots">Loading</span></div>
          ) : (
            <BalancePanel address={saved[0].address} chain={chain} />
          )
        )}
      </div>
    )
  }

  const evmSaved = evmConnected && evmAddresses && evmAddresses.every(a => isWalletSaved(a))
  const phantomSaved = publicKey && isWalletSaved(publicKey.toBase58())

  return (
    <div>
      {error && <p className="lw-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      <WalletRow
        id="metamask" name="MetaMask (EVM)"
        icon={<img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" width="24" height="24" />}
        provider="metamask" chain="evm"
        isSaved={!!evmSaved}
        onConnect={handleMetaMask}
        onSave={evmConnected ? handleSaveEvm : undefined}
        addresses={evmConnected && evmAddresses ? [...evmAddresses] : []}
      />

      <WalletRow
        id="phantom" name="Phantom (Solana)"
        icon={<img src="/phantom_logo.png" alt="Phantom" width="24" height="24" style={{ borderRadius: '6px' }} />}
        provider="phantom" chain="solana"
        isSaved={!!phantomSaved}
        onConnect={() => handleSolanaConnect('phantom')}
        onSave={publicKey && !phantomSaved ? () => handleSaveSolana('phantom') : undefined}
        addresses={publicKey ? [publicKey.toBase58()] : []}
      />

      <WalletRow
        id="solflare" name="Solflare (Solana)"
        icon={<img src="/solflare_logo.png" alt="Solflare" width="24" height="24" style={{ borderRadius: '6px' }} />}
        provider="solflare" chain="solana"
        isSaved={false}
        onConnect={() => handleSolanaConnect('solflare')}
        addresses={[]}
      />

      <div className="lw-row" style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/divigo_logo_round_128px.webp" alt="DiviGo" width="24" height="24" style={{ borderRadius: '50%' }} />
          <span className="lw-row-value">DiviGo Wallet</span>
        </div>
        <button className="lw-btn" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: '#3a3938', color: '#e4dad1', opacity: 0.5, cursor: 'not-allowed' }}>
          Coming Soon
        </button>
      </div>

      <WalletRow
        id="wax" name="WAX Cloud Wallet"
        icon={<img src="https://www.mycloudwallet.com/favicon.ico" alt="WAX" width="24" height="24" style={{ borderRadius: '4px' }} />}
        provider="wax" chain="wax"
        isSaved={false}
        onConnect={handleWaxConnect}
        addresses={[]}
      />
    </div>
  )
}
