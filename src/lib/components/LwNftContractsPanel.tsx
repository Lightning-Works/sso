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

const CHAIN_OPTIONS = [
  'Ethereum', 'Polygon', 'Base', 'BSC', 'Arbitrum', 'Optimism',
  'Avalanche', 'Core', 'SKALE Nebula', 'Solana', 'WAX',
]

export function LwNftContractsPanel() {
  const [contracts, setContracts] = useState<LwNftContract[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<LwNftContract | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => { loadContracts() }, [])

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
      setMessage('Chain and contract address are required')
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
      if (error) { setMessage(`Error: ${error.message}`); return }
    } else {
      const { error } = await supabase.from('lw_nft_contracts').insert(payload)
      if (error) { setMessage(`Error: ${error.message}`); return }
    }

    setEditing(null)
    setShowNew(false)
    setMessage('Saved')
    loadContracts()
    setTimeout(() => setMessage(''), 3000)
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
        setMessage(`Sync error: ${data.error}`)
      } else {
        setMessage(`Synced ${data.nft_count} NFTs for ${contract.collection_name || contract.contract_address}`)
        loadContracts()
      }
    } catch (e) {
      setMessage(`Sync failed: ${(e as Error).message}`)
    }
    setSyncing(null)
    setTimeout(() => setMessage(''), 5000)
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
    const [populated, setPopulated] = useState(!!contract.id)

    const lookupContract = async () => {
      if (!form.contract_address || !form.chain) {
        setMessage('Enter chain and contract address first')
        return
      }
      setLooking(true)
      try {
        const res = await fetch('/api/admin/lookup-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: form.chain, address: form.contract_address }),
        })
        const data = await res.json()
        if (data.error) {
          setMessage(`Lookup: ${data.error}`)
        } else {
          setForm(prev => ({
            ...prev,
            collection_name: data.collection_name || prev.collection_name,
            symbol: data.symbol || prev.symbol,
            token_type: data.token_type || prev.token_type,
            total_supply: data.total_supply ?? prev.total_supply,
            description: data.description || prev.description,
          }))
          setPopulated(true)
          setMessage('Contract info loaded from blockchain')
        }
      } catch {
        setMessage('Lookup failed')
      }
      setLooking(false)
      setTimeout(() => setMessage(''), 3000)
    }

    const disabledStyle = {
      opacity: populated ? 1 : 0.4,
      pointerEvents: populated ? 'auto' as const : 'none' as const,
    }

    return (
      <div style={{ backgroundColor: 'rgba(106,36,250,0.08)', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Chain *</label>
            <select
              value={form.chain}
              onChange={e => { setForm({ ...form, chain: e.target.value }); setPopulated(false) }}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
            >
              {CHAIN_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button
              onClick={lookupContract}
              disabled={looking || !form.contract_address}
              className="lw-btn lw-btn-primary"
              style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            >
              {looking ? 'Looking up...' : 'Lookup Contract'}
            </button>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Contract Address *</label>
            <input
              value={form.contract_address}
              onChange={e => { setForm({ ...form, contract_address: e.target.value }); setPopulated(false) }}
              className="lw-input"
              placeholder="0x... or WAX collection name or Solana address"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', fontFamily: 'monospace' }}
            />
          </div>
          <div style={disabledStyle}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Collection Name</label>
            <input
              value={form.collection_name}
              onChange={e => setForm({ ...form, collection_name: e.target.value })}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
            />
          </div>
          <div style={disabledStyle}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Symbol</label>
            <input
              value={form.symbol}
              onChange={e => setForm({ ...form, symbol: e.target.value })}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
            />
          </div>
          <div style={disabledStyle}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Token Type</label>
            <input
              value={form.token_type}
              onChange={e => setForm({ ...form, token_type: e.target.value })}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
              readOnly={!populated}
            />
          </div>
          <div style={disabledStyle}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Total Supply</label>
            <input
              type="number"
              value={form.total_supply || ''}
              onChange={e => setForm({ ...form, total_supply: e.target.value ? parseInt(e.target.value) : null })}
              className="lw-input"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
            />
          </div>
          <div style={{ ...disabledStyle, gridColumn: '1 / -1' }}>
            <label style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="lw-input"
              rows={2}
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>
          <div style={{ ...disabledStyle, gridColumn: '1 / -1' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button onClick={() => onSave(form)} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.4rem 1.5rem' }}>
            Save
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
      {message && <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: message.startsWith('Error') || message.startsWith('Sync error') || message.startsWith('Lookup:') ? '#ff4444' : '#34A853' }}>{message}</p>}

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
        <div key={c.id} style={{
          backgroundColor: 'var(--lw-wallet-row-bg)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
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
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            <button
              onClick={() => syncContract(c)}
              disabled={syncing === c.id}
              className="lw-btn"
              style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#2a4a2a', color: '#34A853' }}
            >
              {syncing === c.id ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => { setEditing(c); setShowNew(false) }}
              className="lw-btn"
              style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#3a3938', color: '#aaa' }}
            >
              Edit
            </button>
            <button
              onClick={() => deleteContract(c.id!)}
              className="lw-btn"
              style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#3a2020', color: '#ff4444' }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
