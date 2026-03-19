'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { connectWaxWallet } from './wax'
import { shortenAddress } from './types'
import type { ConnectedWallet } from './types'

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

  return (
    <div>
      {error && <p className="lw-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      {/* MetaMask */}
      <div className="lw-row" style={{ padding: '0.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" width="24" height="24" />
          <div>
            <span className="lw-row-value">MetaMask (EVM)</span>
            {evmConnected && evmAddresses && evmAddresses.length > 0 && (
              <div style={{ marginTop: '2px' }}>
                {evmAddresses.map(addr => (
                  <p key={addr} style={{ color: isWalletSaved(addr) ? 'var(--lw-success)' : 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '1px 0' }}>
                    {isWalletSaved(addr) ? '✓ ' : ''}{shortenAddress(addr)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        {evmConnected && evmAddresses && evmAddresses.every(a => isWalletSaved(a)) ? (
          <span className="lw-connected">✓ All Saved</span>
        ) : evmConnected ? (
          <ConnectBtn id="metamask-save" onClick={handleSaveEvm} label={`Save ${evmAddresses?.length || 1} Address${(evmAddresses?.length || 1) > 1 ? 'es' : ''}`} />
        ) : (
          <ConnectBtn id="metamask" onClick={handleMetaMask} />
        )}
      </div>

      {/* Phantom */}
      <div className="lw-row" style={{ padding: '0.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/phantom_logo.png" alt="Phantom" width="24" height="24" style={{ borderRadius: '6px' }} />
          <div>
            <span className="lw-row-value">Phantom (Solana)</span>
            {publicKey && (
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '2px 0 0 0' }}>
                {shortenAddress(publicKey.toBase58())}
              </p>
            )}
          </div>
        </div>
        {publicKey && isWalletSaved(publicKey.toBase58()) ? (
          <span className="lw-connected">✓ Connected</span>
        ) : publicKey ? (
          <ConnectBtn id="phantom-save" onClick={() => handleSaveSolana('phantom')} label="Save Wallet" />
        ) : (
          <ConnectBtn id="phantom" onClick={() => handleSolanaConnect('phantom')} />
        )}
      </div>

      {/* Solflare */}
      <div className="lw-row" style={{ padding: '0.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/solflare_logo.png" alt="Solflare" width="24" height="24" style={{ borderRadius: '6px' }} />
          <span className="lw-row-value">Solflare (Solana)</span>
        </div>
        <ConnectBtn id="solflare" onClick={() => handleSolanaConnect('solflare')} />
      </div>

      {/* DiviGo */}
      <div className="lw-row" style={{ padding: '0.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/divigo_logo_round_128px.webp" alt="DiviGo" width="24" height="24" style={{ borderRadius: '50%' }} />
          <span className="lw-row-value">DiviGo Wallet</span>
        </div>
        <button className="lw-btn" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: '#3a3938', color: '#e4dad1', opacity: 0.5, cursor: 'not-allowed' }}>
          Coming Soon
        </button>
      </div>

      {/* WAX Cloud Wallet */}
      <div className="lw-row" style={{ padding: '0.75rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="https://www.mycloudwallet.com/favicon.ico" alt="WAX" width="24" height="24" style={{ borderRadius: '4px' }} />
          <span className="lw-row-value">WAX Cloud Wallet</span>
        </div>
        <ConnectBtn id="wax" onClick={handleWaxConnect} />
      </div>

      {/* Saved wallets list */}
      {savedWallets.length > 0 && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Saved addresses:</p>
          {savedWallets.map((w, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--lw-text-secondary)' }}>{w.provider} · {w.chainName}</span>
              <span style={{ color: 'var(--lw-text-muted)', fontFamily: 'monospace' }}>{w.displayAddress}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
