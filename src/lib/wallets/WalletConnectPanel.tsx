'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { connectWaxWallet } from './wax'
import { validateDiviAddress, generateDiviChallenge, formatDiviWallet } from './divi'
import { shortenAddress } from './types'
import type { ConnectedWallet, WalletToken } from './types'
import { getBalancesForAddress } from './balances'
import { logWallet } from '@/lib/audit'
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
      // Log the wallet connection
      await logWallet(supabase, 'wallet_linked', {
        user_id: userId,
        description: `Linked ${wallet.provider} wallet ${wallet.displayAddress} (${wallet.chain})`,
        metadata: { chain: wallet.chain, provider: wallet.provider, address: wallet.address },
      })
      onWalletSaved()
      // Auto-expand to show balances
      toggleExpandAddr(wallet.address, wallet.chain)
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

  // Auto-save EVM addresses when they appear
  useEffect(() => {
    if (evmConnected && evmAddresses && chainId) {
      const unsaved = evmAddresses.filter(a => !isWalletSaved(a))
      if (unsaved.length > 0) {
        (async () => {
          for (const addr of unsaved) {
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
        })()
      }
    }
  }, [evmConnected, evmAddresses, chainId])

  // === Solana (Phantom / Solflare) ===
  // Use the actual connected wallet adapter name, not a tracked variable
  const solanaWalletName = useWallet().wallet?.adapter.name || ''

  const handleSolanaConnect = async (walletName: string) => {
    // Disconnect first if switching wallets
    if (publicKey) {
      try { await solDisconnect() } catch { /* ignore */ }
    }
    const wallet = wallets.find(w => w.adapter.name.toLowerCase() === walletName.toLowerCase())
    if (wallet) {
      select(wallet.adapter.name)
      // Small delay to let the adapter register the selection
      setTimeout(async () => {
        try {
          await solConnect()
        } catch (e) {
          console.error('Solana connect error:', e)
        }
        setConnecting('')
      }, 100)
    } else {
      setConnecting('')
    }
  }

  // Auto-save Solana address when connected — use actual adapter name
  useEffect(() => {
    if (publicKey && solanaWalletName && !isWalletSaved(publicKey.toBase58())) {
      const providerName = solanaWalletName.toLowerCase()
      ;(async () => {
        await saveWallet({
          chain: 'solana',
          provider: providerName,
          address: publicKey.toBase58(),
          displayAddress: shortenAddress(publicKey.toBase58()),
          chainName: 'Solana',
        })
        setConnecting('')
      })()
    }
  }, [publicKey, solanaWalletName])

  // === WAX ===
  const handleWaxConnect = async () => {
    const wallet = await connectWaxWallet()
    if (wallet) {
      await saveWallet(wallet)
    }
    setConnecting('')
  }

  // === DIVI ===
  const [diviModalOpen, setDiviModalOpen] = useState(false)
  const [diviStep, setDiviStep] = useState(1)
  const [diviAddress, setDiviAddress] = useState('')
  const [diviChallenge, setDiviChallenge] = useState<{ message: string; nonce: string } | null>(null)
  const [diviSignature, setDiviSignature] = useState('')
  const [diviError, setDiviError] = useState('')
  const [diviVerifying, setDiviVerifying] = useState(false)
  const [diviBalance, setDiviBalance] = useState<number | null>(null)
  const [diviCopied, setDiviCopied] = useState(false)

  const handleDiviOpen = () => {
    playClick()
    setDiviModalOpen(true)
    setDiviStep(1)
    setDiviAddress('')
    setDiviChallenge(null)
    setDiviSignature('')
    setDiviError('')
    setDiviVerifying(false)
    setDiviBalance(null)
    setDiviCopied(false)
  }

  const handleDiviStep1 = () => {
    playClick()
    if (!validateDiviAddress(diviAddress.trim())) {
      setDiviError('Please enter a valid DIVI address (starts with D)')
      return
    }
    setDiviError('')
    const challenge = generateDiviChallenge()
    setDiviChallenge(challenge)
    setDiviStep(2)
  }

  const handleDiviStep2 = () => {
    playClick()
    setDiviStep(3)
  }

  const handleDiviCopyMessage = async () => {
    if (diviChallenge) {
      await navigator.clipboard.writeText(diviChallenge.message)
      setDiviCopied(true)
      setTimeout(() => setDiviCopied(false), 2000)
    }
  }

  const handleDiviConnect = async () => {
    playClick()
    if (!diviSignature.trim()) {
      setDiviError('Please paste your signature')
      return
    }
    if (!diviChallenge) return

    setDiviError('')
    setDiviVerifying(true)

    try {
      const res = await fetch('/api/wallet/divi-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: diviAddress.trim(),
          message: diviChallenge.message,
          signature: diviSignature.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.verified) {
        setDiviError(data.error || 'Signature verification failed. Please try again.')
        setDiviVerifying(false)
        return
      }

      // Save the wallet
      const wallet = formatDiviWallet(diviAddress.trim())
      await saveWallet(wallet)
      setDiviBalance(data.balance ?? null)
      setDiviStep(4) // success
    } catch {
      setDiviError('Connection failed. Please try again.')
    }
    setDiviVerifying(false)
  }

  // Filter
  const [hideSmall, setHideSmall] = useState(true)

  // Expandable panels — per address
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null)
  const [walletBalances, setWalletBalances] = useState<Record<string, WalletToken[]>>({})
  const [loadingBalances, setLoadingBalances] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [addingAddr, setAddingAddr] = useState<string | null>(null)

  useEffect(() => {
    getTokenPrices().then(setPrices)
  }, [])

  const toggleExpandAddr = async (address: string, chain: 'evm' | 'solana' | 'wax' | 'divi') => {
    if (expandedAddr === address) {
      setExpandedAddr(null)
      return
    }
    setExpandedAddr(address)
    if (!walletBalances[address]) {
      setLoadingBalances(address)
      const balances = await getBalancesForAddress(chain, address)
      setWalletBalances(prev => ({ ...prev, [address]: balances }))
      const freshPrices = await getTokenPrices()
      setPrices(freshPrices)
      setLoadingBalances(null)
    }
  }

  const handleAddAnother = async (provider: string, chain: string) => {
    playClick()
    if (chain === 'solana') {
      try { await solDisconnect() } catch { /* ignore */ }
    } else if (chain === 'evm') {
      try { evmDisconnect() } catch { /* ignore */ }
    }
    setAddingAddr(provider)
  }

  const handleConfirmAddAddr = async (provider: string, chain: string) => {
    setAddingAddr(null)
    setConnecting(provider)
    if (chain === 'solana') {
      const wallet = wallets.find(w => w.adapter.name.toLowerCase() === provider.toLowerCase())
      if (wallet) {
        try {
          select(wallet.adapter.name)
          await new Promise(resolve => setTimeout(resolve, 300))
          await wallet.adapter.connect()
        } catch (e) {
          console.error('Add address error:', e)
        }
      }
      setConnecting('')
    } else if (chain === 'evm') {
      // For MetaMask, request accounts directly — this prompts the user to select/authorize accounts
      try {
        const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum
        if (ethereum) {
          const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
          // Save any new accounts
          for (const addr of accounts) {
            if (!isWalletSaved(addr)) {
              await saveWallet({
                chain: 'evm',
                provider: 'metamask',
                address: addr,
                displayAddress: shortenAddress(addr),
                chainId: chainId || 1,
                chainName: chainId === 137 ? 'Polygon' : chainId === 8453 ? 'Base' : chainId === 56 ? 'BSC' : 'Ethereum',
              })
            }
          }
        }
      } catch (e) {
        console.error('MetaMask add address error:', e)
      }
      setConnecting('')
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
      return <div style={{ padding: '0.5rem 0.75rem 0.75rem 2.75rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}><span className="lw-dots">Loading</span></div>
    }
    if (tokens.length === 0) {
      return <div style={{ padding: '0.5rem 0.75rem 0.75rem 2.75rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No tokens found</div>
    }

    // Native chain symbols — always show first
    const nativeSymbols: Record<string, string> = { evm: 'ETH', solana: 'SOL', wax: 'WAX', divi: 'DIVI' }
    const nativeSymbol = nativeSymbols[chain] || ''

    // Calculate USD values and sort
    const enriched = tokens.map(t => {
      const bal = parseFloat(t.balance)
      const price = prices[t.symbol] || tokenPrices[t.address || t.symbol] || null
      const usdValue = bal > 0 && price ? bal * price : null
      const isNative = t.symbol === nativeSymbol && !t.address
      return { ...t, bal, price, usdValue, isNative }
    })

    // Sort: native first, then by USD value descending
    enriched.sort((a, b) => {
      if (a.isNative && !b.isNative) return -1
      if (!a.isNative && b.isNative) return 1
      const aVal = a.usdValue ?? -1
      const bVal = b.usdValue ?? -1
      return bVal - aVal
    })

    // Filter
    const filtered = hideSmall
      ? enriched.filter(t => t.isNative || (t.usdValue !== null && t.usdValue >= 1) || t.bal === 0)
      : enriched

    return (
      <div style={{ padding: '0.25rem 0.75rem 0.75rem 2.75rem' }}>
        {filtered.map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--lw-text-primary)', fontSize: '0.85rem', fontWeight: 500, minWidth: '55px' }}>{t.symbol}</span>
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>{t.name !== t.symbol ? t.name : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ color: 'var(--lw-text-white)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{t.bal > 0 ? t.balance : '0'}</span>
              <span style={{ color: '#aaa', fontSize: '0.75rem', minWidth: '65px', textAlign: 'right' }}>
                {t.bal <= 0 ? '' : t.usdValue !== null ? `[${formatUsd(t.usdValue)}]` : '[not found]'}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Find saved wallets by provider
  const getSavedForProvider = (provider: string) => savedWallets.filter(w => w.provider === provider)

  const AddressRow = ({ addr, chain, isActive }: { addr: string, chain: 'evm' | 'solana' | 'wax' | 'divi' | 'divi', isActive: boolean }) => {
    const isExp = expandedAddr === addr
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: '2px 0' }}>
          {chain === 'wax' || chain === 'evm' || chain === 'solana' || chain === 'divi' ? (
            <>
              <a
                href={chain === 'divi' ? `/wallet/divi?address=${encodeURIComponent(addr)}` : chain === 'wax' ? `/wallet/wax?account=${encodeURIComponent(addr)}` : chain === 'solana' ? `/wallet/solana?address=${encodeURIComponent(addr)}` : `/wallet/evm?address=${encodeURIComponent(addr)}`}
                style={{
                  color: isActive ? 'var(--lw-success)' : 'rgb(99, 176, 79)',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                title={chain === 'wax' ? 'View WAX portfolio & NFTs' : chain === 'solana' ? 'View Solana portfolio & NFTs' : 'View EVM portfolio & NFTs'}
              >
                ✓ {shortenAddress(addr)}
              </a>
              {(chain === 'evm' || chain === 'solana') && (
                <a
                  href={chain === 'solana' ? `/wallet/solana?address=${encodeURIComponent(addr)}` : `/wallet/evm?address=${encodeURIComponent(addr)}`}
                  style={{
                    marginLeft: '0.35rem', fontSize: '0.6rem', color: 'rgb(99, 176, 79)',
                    textDecoration: 'none', padding: '1px 5px',
                    border: '1px solid rgba(99, 176, 79, 0.3)', borderRadius: '4px',
                  }}
                  title="Open wallet"
                >
                  wallet
                </a>
              )}
            </>
          ) : (
            <span style={{
              color: isActive ? 'var(--lw-success)' : 'rgb(99, 176, 79)',
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              fontWeight: isActive ? 600 : 400,
            }}>
              ✓ {shortenAddress(addr)}
            </span>
          )}
          <span
            style={{ color: 'var(--lw-text-muted)', fontSize: '0.6rem', cursor: 'pointer', padding: '0 0.25rem' }}
            onClick={(e) => { e.stopPropagation(); toggleExpandAddr(addr, chain) }}
          >
            {isExp ? '▲' : '▼'}
          </span>
        </div>
        {isExp && (
          loadingBalances === addr ? (
            <div style={{ padding: '0.25rem 0 0.5rem 1rem', color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}><span className="lw-dots">Loading</span></div>
          ) : (
            <BalancePanel address={addr} chain={chain} />
          )
        )}
      </>
    )
  }

  const WalletRow = ({ id, name, icon, provider, chain, isSaved, onConnect, addresses, canAddMore, walletLink }: {
    id: string, name: string, icon: React.ReactNode, provider: string, chain: 'evm' | 'solana' | 'wax' | 'divi' | 'divi',
    isSaved: boolean, onConnect: () => void, addresses: string[], canAddMore?: boolean, walletLink?: string
  }) => {
    const saved = getSavedForProvider(provider)
    const allAddresses = [...new Set([...addresses, ...saved.map(w => w.address)])]

    return (
      <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', marginBottom: '0.5rem', overflow: 'hidden' }}>
        <div className="lw-row" style={{ padding: '0.75rem', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1 }}>
            <div style={{ paddingTop: '2px' }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <span className="lw-row-value">{name}</span>
              {allAddresses.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  {allAddresses.map((addr, i) => (
                    <AddressRow key={addr} addr={addr} chain={chain} isActive={expandedAddr === addr} />
                  ))}
                  {canAddMore && isSaved && addingAddr !== provider && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAddAnother(provider, chain) }}
                      className="lw-btn"
                      style={{ padding: '0.1rem 0.5rem', fontSize: '0.65rem', backgroundColor: '#3a3938', color: '#aaa', marginTop: '3px', width: 'auto', cursor: 'pointer' }}
                    >
                      + Add Addr
                    </button>
                  )}
                  {addingAddr === provider && (
                    <div style={{ marginTop: '6px', padding: '0.5rem', backgroundColor: 'rgba(106,36,250,0.15)', borderRadius: '4px' }}>
                      <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.7rem', margin: '0 0 0.5rem 0' }}>
                        In your {name.split(' ')[0]} extension, switch to the account you want to add.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); playClick(); handleConfirmAddAddr(provider, chain) }}
                          className="lw-btn"
                          style={{ padding: '0.15rem 0.75rem', fontSize: '0.7rem', backgroundColor: 'var(--lw-purple)', color: '#fff', width: 'auto', cursor: 'pointer' }}
                        >
                          Connect
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddingAddr(null) }}
                          className="lw-btn"
                          style={{ padding: '0.15rem 0.75rem', fontSize: '0.7rem', backgroundColor: '#3a3938', color: '#aaa', width: 'auto', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {isSaved ? (
              <>
                {walletLink && (
                  <a href={walletLink} className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', textDecoration: 'none', minWidth: '80px', textAlign: 'center' }}>
                    Wallet
                  </a>
                )}
                <button className="lw-btn" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', backgroundColor: 'rgb(62, 45, 107)', color: '#ccc', cursor: 'default', minWidth: '100px' }}>
                  Linked
                </button>
              </>
            ) : (
              <ConnectBtn id={id} onClick={onConnect} />
            )}
          </div>
        </div>
      </div>
    )
  }

  const metamaskSavedWallets = savedWallets.filter(w => w.provider === 'metamask')
  const evmSaved = metamaskSavedWallets.length > 0
  const phantomSavedWallets = savedWallets.filter(w => w.provider === 'phantom')
  const solflareSavedWallets = savedWallets.filter(w => w.provider === 'solflare')
  const waxSavedWallets = savedWallets.filter(w => w.provider === 'wax')
  const diviSavedWallets = savedWallets.filter(w => w.provider === 'divi')
  const diviSaved = diviSavedWallets.length > 0
  const isCurrentlyPhantom = solanaWalletName.toLowerCase() === 'phantom'
  const isCurrentlySolflare = solanaWalletName.toLowerCase() === 'solflare'
  const phantomSaved = phantomSavedWallets.length > 0
  const solflareSaved = solflareSavedWallets.length > 0
  const waxSaved = waxSavedWallets.length > 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--lw-text-muted)' }}>
          <input
            type="checkbox"
            checked={hideSmall}
            onChange={e => setHideSmall(e.target.checked)}
            style={{ accentColor: 'var(--lw-purple)', width: '14px', height: '14px', cursor: 'pointer' }}
          />
          Hide &lt; US$1
        </label>
      </div>
      {error && <p className="lw-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      <WalletRow
        id="metamask" name="MetaMask (EVM)"
        icon={<img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" width="24" height="24" />}
        provider="metamask" chain="evm"
        isSaved={evmSaved}
        onConnect={handleMetaMask}
        addresses={evmConnected && evmAddresses ? [...evmAddresses] : metamaskSavedWallets.map(w => w.address)}
        canAddMore={true}
      />

      <WalletRow
        id="phantom" name="Phantom (Solana)"
        icon={<img src="/phantom_logo.png" alt="Phantom" width="24" height="24" style={{ borderRadius: '6px' }} />}
        provider="phantom" chain="solana"
        isSaved={phantomSaved}
        onConnect={() => handleSolanaConnect('phantom')}
        addresses={isCurrentlyPhantom && publicKey ? [publicKey.toBase58()] : phantomSavedWallets.map(w => w.address)}
        canAddMore={true}
      />

      <WalletRow
        id="solflare" name="Solflare (Solana)"
        icon={<img src="/solflare_logo.png" alt="Solflare" width="24" height="24" style={{ borderRadius: '6px' }} />}
        provider="solflare" chain="solana"
        isSaved={solflareSaved}
        onConnect={() => handleSolanaConnect('solflare')}
        addresses={isCurrentlySolflare && publicKey ? [publicKey.toBase58()] : solflareSavedWallets.map(w => w.address)}
        canAddMore={true}
      />

      <div style={{ backgroundColor: 'var(--lw-wallet-row-bg)', borderRadius: 'var(--lw-radius-sm)', marginBottom: '0.5rem' }}>
        <div className="lw-row" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/divigo_logo_round_128px.webp" alt="DiviGo" width="24" height="24" style={{ borderRadius: '50%' }} />
            <span className="lw-row-value">DiviGo Wallet</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <a href="/wallet/divi" className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.25rem 1rem', fontSize: '0.875rem', textDecoration: 'none' }}>
              Open
            </a>
          </div>
        </div>
      </div>

      <WalletRow
        id="divi" name="Divi Wallet"
        icon={<img src="/bert_divi_wallet_logo_v2.webp" alt="Divi" width="24" height="24" style={{ borderRadius: '50%' }} />}
        provider="divi" chain="divi"
        isSaved={diviSaved}
        onConnect={handleDiviOpen}
        addresses={diviSavedWallets.map(w => w.address)}
      />

      <WalletRow
        id="wax" name="WAX Cloud Wallet"
        icon={<img src="https://www.mycloudwallet.com/favicon.ico" alt="WAX" width="24" height="24" style={{ borderRadius: '4px' }} />}
        provider="wax" chain="wax"
        isSaved={waxSaved}
        onConnect={handleWaxConnect}
        addresses={waxSavedWallets.map(w => w.address)}
        walletLink={waxSavedWallets[0] ? `/wallet/wax?account=${encodeURIComponent(waxSavedWallets[0].address)}` : undefined}
      />

      {/* Divi Connect Modal */}
      {diviModalOpen && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
          onClick={() => { if (diviStep !== 4) setDiviModalOpen(false) }}
        >
          <div
            style={{
              backgroundColor: 'var(--lw-panel, rgba(0,0,0,0.8))', borderRadius: 'var(--lw-radius, 8px)', padding: '2rem',
              maxWidth: '460px', width: '90%', position: 'relative',
              border: '1px solid var(--lw-border, #4c4946)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setDiviModalOpen(false)}
              style={{
                position: 'absolute', top: '12px', right: '16px',
                background: 'none', border: 'none', color: 'var(--lw-text-muted, #7a7572)',
                fontSize: '1.25rem', cursor: 'pointer', padding: '4px',
              }}
            >
              &#x2715;
            </button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <img src="/bert_divi_wallet_logo_v2.webp" alt="Divi" width="32" height="32" style={{ borderRadius: '50%' }} />
              <h3 style={{ margin: 0, color: 'var(--lw-text-white, #fff)', fontSize: '1.15rem' }}>Connect Divi Wallet</h3>
            </div>

            {/* Step indicators */}
            {diviStep < 4 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {[1, 2, 3].map(s => (
                  <div key={s} style={{
                    flex: 1, height: '3px', borderRadius: '2px',
                    backgroundColor: s <= diviStep ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.1)',
                    transition: 'background-color 0.3s',
                  }} />
                ))}
              </div>
            )}

            {/* Step 1: Enter Address */}
            {diviStep === 1 && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                }}>
                  <span style={{
                    backgroundColor: 'var(--lw-purple, #6a24fa)', color: '#fff',
                    borderRadius: '50%', width: '24px', height: '24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                  }}>1</span>
                  <span style={{ color: 'var(--lw-text-white, #fff)', fontWeight: 600 }}>Enter your DIVI address</span>
                </div>
                <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                  Paste your DIVI wallet address below. It starts with the letter D.
                </p>
                <input
                  type="text"
                  value={diviAddress}
                  onChange={e => { setDiviAddress(e.target.value); setDiviError('') }}
                  placeholder="D7hrf45..."
                  className="lw-input"
                  style={{ fontFamily: 'monospace', boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter') handleDiviStep1() }}
                  autoFocus
                />
                {diviError && <p style={{ color: 'var(--lw-error, #ff4444)', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>{diviError}</p>}
                <button
                  onClick={handleDiviStep1}
                  className="lw-btn lw-btn-primary"
                  style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 600 }}
                >
                  Next
                </button>
              </div>
            )}

            {/* Step 2: Sign Message */}
            {diviStep === 2 && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                }}>
                  <span style={{
                    backgroundColor: 'var(--lw-purple, #6a24fa)', color: '#fff',
                    borderRadius: '50%', width: '24px', height: '24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                  }}>2</span>
                  <span style={{ color: 'var(--lw-text-white, #fff)', fontWeight: 600 }}>Sign this message in your Divi wallet</span>
                </div>
                <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.85rem', margin: '0 0 0.75rem 0' }}>
                  Open your Divi wallet, go to <strong style={{ color: 'var(--lw-text-secondary, #bab1a8)' }}>Sign Message</strong>, paste the message below, and sign it with your address.
                </p>
                <div style={{
                  position: 'relative', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 'var(--lw-radius-sm, 4px)',
                  padding: '0.75rem', border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <pre style={{
                    color: 'var(--lw-text-primary, #e4dad1)', fontSize: '0.8rem', margin: 0,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace',
                    paddingRight: '2.5rem',
                  }}>{diviChallenge?.message}</pre>
                  <button
                    onClick={handleDiviCopyMessage}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                      color: diviCopied ? 'var(--lw-success, #44ff44)' : 'var(--lw-text-muted, #7a7572)', borderRadius: 'var(--lw-radius-sm, 4px)',
                      padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer',
                    }}
                  >
                    {diviCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={handleDiviStep2}
                  className="lw-btn lw-btn-primary"
                  style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 600 }}
                >
                  I&apos;ve Signed It
                </button>
              </div>
            )}

            {/* Step 3: Paste Signature */}
            {diviStep === 3 && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                }}>
                  <span style={{
                    backgroundColor: 'var(--lw-purple, #6a24fa)', color: '#fff',
                    borderRadius: '50%', width: '24px', height: '24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                  }}>3</span>
                  <span style={{ color: 'var(--lw-text-white, #fff)', fontWeight: 600 }}>Paste your signature</span>
                </div>
                <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                  Copy the signature from your Divi wallet and paste it below.
                </p>
                <textarea
                  value={diviSignature}
                  onChange={e => { setDiviSignature(e.target.value); setDiviError('') }}
                  placeholder="Paste signature here..."
                  rows={3}
                  className="lw-input"
                  style={{
                    fontFamily: 'monospace', fontSize: '0.85rem',
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                {diviError && <p style={{ color: 'var(--lw-error, #ff4444)', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>{diviError}</p>}
                <button
                  onClick={handleDiviConnect}
                  disabled={diviVerifying}
                  className="lw-btn lw-btn-primary"
                  style={{
                    width: '100%', marginTop: '1rem', padding: '0.6rem',
                    fontSize: '0.95rem', fontWeight: 600, cursor: diviVerifying ? 'wait' : 'pointer',
                    opacity: diviVerifying ? 0.7 : 1,
                  }}
                >
                  {diviVerifying ? <span className="lw-dots">Verifying</span> : 'Connect'}
                </button>
              </div>
            )}

            {/* Step 4: Success */}
            {diviStep === 4 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: 'rgba(74, 222, 128, 0.15)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                  fontSize: '1.75rem',
                }}>
                  <span style={{ color: 'var(--lw-success, #44ff44)' }}>&#10003;</span>
                </div>
                <h3 style={{ color: 'var(--lw-text-white, #fff)', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>Connected!</h3>
                <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.85rem', margin: '0 0 0.25rem 0' }}>
                  {shortenAddress(diviAddress)}
                </p>
                {diviBalance !== null && (
                  <p style={{ color: 'var(--lw-success, #44ff44)', fontSize: '1.1rem', fontWeight: 600, margin: '0.75rem 0' }}>
                    You have {diviBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} DIVI in your wallet.
                  </p>
                )}
                <button
                  onClick={() => setDiviModalOpen(false)}
                  className="lw-btn lw-btn-primary"
                  style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 600 }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
