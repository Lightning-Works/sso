'use client'

import { useState, useEffect } from 'react'
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
  icon_url?: string | null
}

const CHAIN_OPTIONS = [
  'Ethereum', 'Polygon', 'Base', 'BSC', 'Arbitrum', 'Optimism',
  'Avalanche', 'Core', 'SKALE Nebula', 'Solana', 'WAX',
]

interface NftData {
  id: string
  token_id: string
  name: string
  image_url: string | null
  owner: string | null
  attributes: unknown[]
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
  const [totalNfts, setTotalNfts] = useState(0)
  const PAGE_SIZE = 100

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
    setNftPage(page)

    const { data, count } = await supabase
      .from('lw_nft_data')
      .select('id, token_id, name, image_url, owner, attributes', { count: 'exact' })
      .eq('contract_id', c.id)
      .order('token_id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    setNfts((data || []) as NftData[])
    setTotalNfts(count || 0)
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
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1 }}>
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
          {loadingNfts ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>Loading NFTs...</p>
          ) : nfts.length === 0 ? (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>No NFTs cached. Click "Sync Now" to fetch from blockchain.</p>
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
                {nfts.map(nft => (
                  <div key={nft.id} style={{
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                  }}>
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
                          src={nft.image_url.startsWith('Qm') || nft.image_url.startsWith('bafy') ? `https://ipfs.io/ipfs/${nft.image_url}` : nft.image_url}
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
                      <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.55rem', margin: '0.1rem 0 0 0' }}>
                        #{nft.token_id}
                      </p>
                      {nft.owner && (
                        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.5rem', margin: '0.1rem 0 0 0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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
  const supabase = createClient()

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
            <p style={{ color: '#34A853', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Contract found on {form.chain}:</p>
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
