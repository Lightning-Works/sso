'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VALID_RULE_TYPES, VALID_OPERATORS, VALID_CHAINS } from '@/lib/gates/validation'

interface GateRule {
  id?: string
  rule_type: string
  chain: string
  evm_chain: string
  collection_address: string
  symbol: string
  contract: string
  trait_type: string
  trait_value: string
  operator: string
  amount: number | null
  sort_order: number
}

interface Gate {
  id: string
  app_slug: string
  display_id: string
  name: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
  rules?: GateRule[]
}

interface App {
  slug: string
  name: string
}

const EVM_CHAINS = ['ethereum', 'polygon', 'base', 'bsc', 'arbitrum', 'optimism', 'avalanche', 'core', 'waterfall']

const inputStyle = { backgroundColor: 'rgb(26,17,46)', color: '#bab1a8' }
const labelStyle = { color: 'var(--lw-text-primary)', fontWeight: 'bold' as const, fontSize: '0.85rem', display: 'block' as const, marginBottom: '0.25rem' }
const smallLabelStyle = { color: 'var(--lw-text-secondary)', fontSize: '0.75rem', display: 'block' as const, marginBottom: '0.2rem' }

function emptyRule(sortOrder = 0): GateRule {
  return {
    rule_type: 'token_balance', chain: 'evm', evm_chain: 'ethereum',
    collection_address: '', symbol: '', contract: '',
    trait_type: '', trait_value: '', operator: 'gte', amount: null, sort_order: sortOrder,
  }
}

// ── Rule Editor Row ──

function RuleRow({ rule, index, onChange, onRemove }: {
  rule: GateRule; index: number; onChange: (r: GateRule) => void; onRemove: () => void
}) {
  const update = (field: string, value: unknown) => onChange({ ...rule, [field]: value })
  const isNft = rule.rule_type.startsWith('nft_')
  const isToken = rule.rule_type === 'token_balance' || rule.rule_type === 'custom_token'
  const showEvmChain = rule.chain === 'evm'
  const showCollection = isNft
  const showSymbol = isToken
  const showContract = isToken && rule.chain !== 'divi'
  const showTrait = rule.rule_type === 'nft_trait'
  const showAmount = rule.operator === 'gte' || rule.operator === 'lte'

  return (
    <div style={{
      padding: '0.75rem', marginBottom: '0.5rem', borderRadius: 'var(--lw-radius-sm)',
      backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>Rule {index + 1}</span>
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', color: 'var(--lw-error)', fontSize: '0.75rem', cursor: 'pointer', padding: '2px 6px',
        }}>Remove</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
        {/* Rule Type */}
        <div>
          <label style={smallLabelStyle}>Rule Type</label>
          <select className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} value={rule.rule_type} onChange={e => update('rule_type', e.target.value)}>
            {VALID_RULE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {/* Chain */}
        <div>
          <label style={smallLabelStyle}>Chain</label>
          <select className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} value={rule.chain} onChange={e => update('chain', e.target.value)}>
            {VALID_CHAINS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>

        {/* EVM Chain (conditional) */}
        {showEvmChain ? (
          <div>
            <label style={smallLabelStyle}>EVM Chain</label>
            <select className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} value={rule.evm_chain || 'ethereum'} onChange={e => update('evm_chain', e.target.value)}>
              {EVM_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label style={smallLabelStyle}>Operator</label>
            <select className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} value={rule.operator} onChange={e => update('operator', e.target.value)}>
              {VALID_OPERATORS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
        {/* Operator (when EVM chain is shown above) */}
        {showEvmChain && (
          <div>
            <label style={smallLabelStyle}>Operator</label>
            <select className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} value={rule.operator} onChange={e => update('operator', e.target.value)}>
              {VALID_OPERATORS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        )}

        {/* Amount (conditional) */}
        {showAmount && (
          <div>
            <label style={smallLabelStyle}>Amount</label>
            <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }} type="number" min="0" step="any"
              value={rule.amount ?? ''} onChange={e => update('amount', e.target.value === '' ? null : parseFloat(e.target.value))}
              placeholder="0"
            />
          </div>
        )}

        {/* Symbol (token rules) */}
        {showSymbol && (
          <div>
            <label style={smallLabelStyle}>Symbol (e.g. ETH, SOL, DIVI)</label>
            <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }}
              value={rule.symbol} onChange={e => update('symbol', e.target.value)} placeholder="ETH"
            />
          </div>
        )}

        {/* Contract (token rules) */}
        {showContract && (
          <div>
            <label style={smallLabelStyle}>Contract Address (for non-native tokens)</label>
            <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }}
              value={rule.contract} onChange={e => update('contract', e.target.value)} placeholder="0x..."
            />
          </div>
        )}

        {/* Collection (NFT rules) */}
        {showCollection && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={smallLabelStyle}>Collection Address</label>
            <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem', width: '100%' }}
              value={rule.collection_address} onChange={e => update('collection_address', e.target.value)} placeholder="Contract or collection address"
            />
          </div>
        )}

        {/* Trait (nft_trait only) */}
        {showTrait && (
          <>
            <div>
              <label style={smallLabelStyle}>Trait Type</label>
              <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }}
                value={rule.trait_type} onChange={e => update('trait_type', e.target.value)} placeholder="e.g. Background"
              />
            </div>
            <div>
              <label style={smallLabelStyle}>Trait Value (blank = any)</label>
              <input className="lw-input" style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.4rem' }}
                value={rule.trait_value} onChange={e => update('trait_value', e.target.value)} placeholder="e.g. Blue"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Gate Editor ──

function GateEditor({ gate, apps, onSave, onCancel }: {
  gate: Gate | null; apps: App[]; onSave: () => void; onCancel: () => void
}) {
  const isNew = !gate
  const [name, setName] = useState(gate?.name || '')
  const [description, setDescription] = useState(gate?.description || '')
  const [appSlug, setAppSlug] = useState(gate?.app_slug || apps[0]?.slug || '')
  const [isActive, setIsActive] = useState(gate?.is_active ?? true)
  const [rules, setRules] = useState<GateRule[]>(gate?.rules || [emptyRule()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateRule = (index: number, rule: GateRule) => {
    const next = [...rules]
    next[index] = rule
    setRules(next)
  }

  const removeRule = (index: number) => {
    if (rules.length <= 1) return
    setRules(rules.filter((_, i) => i !== index).map((r, i) => ({ ...r, sort_order: i })))
  }

  const addRule = () => setRules([...rules, emptyRule(rules.length)])

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!appSlug) { setError('App is required'); return }
    if (rules.length === 0) { setError('At least one rule is required'); return }

    setSaving(true)
    setError('')

    try {
      const rulePayload = rules.map((r, i) => ({
        rule_type: r.rule_type,
        chain: r.chain || null,
        evm_chain: r.chain === 'evm' ? (r.evm_chain || 'ethereum') : null,
        collection_address: r.collection_address || null,
        symbol: r.symbol || null,
        contract: r.contract || null,
        trait_type: r.trait_type || null,
        trait_value: r.trait_value || null,
        operator: r.operator || 'must_have',
        amount: r.amount,
        sort_order: i,
      }))

      const url = isNew ? '/api/gates' : `/api/gates/${gate.id}`
      const method = isNew ? 'POST' : 'PUT'
      const body = isNew
        ? { app_slug: appSlug, name: name.trim(), description: description.trim(), rules: rulePayload }
        : { name: name.trim(), description: description.trim(), is_active: isActive, rules: rulePayload }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return }

      onSave()
    } catch {
      setError('Save failed')
    }
    setSaving(false)
  }

  return (
    <div className="lw-section" style={{ marginTop: '1rem' }}>
      <h3 className="lw-section-title">{isNew ? 'New Gate' : `Edit: ${gate.name}`}</h3>
      <div className="lw-form">
        <div style={{ display: 'grid', gridTemplateColumns: isNew ? '2fr 1fr' : '2fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Gate Name</label>
            <input className="lw-input" style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. VIP Access" />
          </div>
          {isNew ? (
            <div>
              <label style={labelStyle}>App</label>
              <select className="lw-input" style={inputStyle} value={appSlug} onChange={e => setAppSlug(e.target.value)}>
                {apps.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>App</label>
                <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>{gate.app_slug} ({gate.display_id})</span>
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                    style={{ accentColor: 'var(--lw-purple)', width: '16px', height: '16px' }} />
                  Active
                </label>
              </div>
            </>
          )}
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input className="lw-input" style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>

        {/* Rules */}
        <div style={{ marginTop: '0.5rem' }}>
          <label style={labelStyle}>Rules ({rules.length})</label>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0 0 0.5rem 0' }}>
            All rules must pass for the gate to open. User&apos;s connected wallets are checked against each rule.
          </p>
          {rules.map((rule, i) => (
            <RuleRow key={i} rule={rule} index={i} onChange={r => updateRule(i, r)} onRemove={() => removeRule(i)} />
          ))}
          <button onClick={addRule} className="lw-btn" style={{
            width: 'auto', padding: '0.3rem 1rem', fontSize: '0.8rem',
            backgroundColor: '#3a3938', color: '#e4dad1', cursor: 'pointer',
          }}>+ Add Rule</button>
        </div>

        {error && <p style={{ color: 'var(--lw-error)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button onClick={handleSave} disabled={saving} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
            {saving ? 'Saving...' : isNew ? 'Create Gate' : 'Save'}
          </button>
          <button onClick={onCancel} className="lw-btn lw-btn-secondary" style={{ width: 'auto' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Rule Summary (read-only) ──

function RuleSummary({ rule }: { rule: GateRule }) {
  const parts: string[] = []
  parts.push(rule.rule_type.replace(/_/g, ' '))
  if (rule.chain) parts.push(`[${rule.chain}${rule.evm_chain && rule.chain === 'evm' ? ':' + rule.evm_chain : ''}]`)
  if (rule.symbol) parts.push(rule.symbol)
  if (rule.collection_address) parts.push(rule.collection_address.slice(0, 10) + '...')
  if (rule.trait_type) parts.push(`trait: ${rule.trait_type}${rule.trait_value ? '=' + rule.trait_value : ''}`)
  parts.push(rule.operator.replace(/_/g, ' '))
  if (rule.amount !== null && rule.amount !== undefined) parts.push(String(rule.amount))

  return (
    <div style={{ fontSize: '0.75rem', color: 'var(--lw-text-secondary)', padding: '0.15rem 0', fontFamily: 'monospace' }}>
      {parts.join(' ')}
    </div>
  )
}

// ── Main Gates Panel ──

export function GatesPanel() {
  const [gates, setGates] = useState<Gate[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [filterApp, setFilterApp] = useState('')
  const [editingGate, setEditingGate] = useState<Gate | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState('')
  const supabase = createClient()

  const loadData = async () => {
    // Load apps
    const { data: appsData } = await supabase.from('apps').select('slug, name').order('name')
    const appsList = (appsData || []) as App[]
    setApps(appsList)

    // Load gates for all apps (or filtered)
    const slugs = filterApp ? [filterApp] : appsList.map(a => a.slug)
    const allGates: Gate[] = []
    for (const slug of slugs) {
      const res = await fetch(`/api/gates?app=${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json()
        allGates.push(...(data.gates || []))
      }
    }

    // Load rules for each gate
    for (const gate of allGates) {
      const res = await fetch(`/api/gates/${gate.id}`)
      if (res.ok) {
        const data = await res.json()
        gate.rules = data.gate?.rules || []
      }
    }

    setGates(allGates)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [filterApp])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this gate and all its rules?')) return
    setDeleting(id)
    await fetch(`/api/gates/${id}`, { method: 'DELETE' })
    setDeleting('')
    loadData()
  }

  const handleToggleActive = async (gate: Gate) => {
    await fetch(`/api/gates/${gate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !gate.is_active }),
    })
    loadData()
  }

  if (loading) {
    return <p style={{ color: 'var(--lw-text-muted)', padding: '1rem' }}>Loading gates...</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 className="lw-section-title" style={{ margin: 0 }}>Token Gates ({gates.length})</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select className="lw-input" style={{ ...inputStyle, width: 'auto', minWidth: '150px', fontSize: '0.85rem', padding: '0.4rem 0.5rem' }}
            value={filterApp} onChange={e => { setFilterApp(e.target.value); setLoading(true) }}>
            <option value="">All Apps</option>
            {apps.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          <button onClick={() => { setShowNew(true); setEditingGate(null) }} className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>
            + New Gate
          </button>
        </div>
      </div>

      {showNew && (
        <GateEditor gate={null} apps={apps} onSave={() => { setShowNew(false); loadData() }} onCancel={() => setShowNew(false)} />
      )}

      {gates.length === 0 && !showNew && (
        <div className="lw-section" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--lw-text-muted)' }}>No gates configured. Create one to get started.</p>
        </div>
      )}

      {gates.map(gate => (
        <div key={gate.id}>
          {editingGate?.id === gate.id ? (
            <GateEditor gate={gate} apps={apps} onSave={() => { setEditingGate(null); loadData() }} onCancel={() => setEditingGate(null)} />
          ) : (
            <div className="lw-section" style={{ padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--lw-text-white)', fontWeight: 500 }}>{gate.name}</span>
                    <span style={{
                      fontSize: '0.65rem', padding: '1px 6px', borderRadius: '3px',
                      backgroundColor: gate.is_active ? 'rgba(68,255,68,0.15)' : 'rgba(255,68,68,0.15)',
                      color: gate.is_active ? 'var(--lw-success)' : 'var(--lw-error)',
                    }}>
                      {gate.is_active ? 'active' : 'inactive'}
                    </span>
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>{gate.display_id}</span>
                  </div>
                  <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', margin: '0 0 0.25rem 0' }}>
                    app: {gate.app_slug} · {gate.rules?.length || 0} rule{(gate.rules?.length || 0) !== 1 ? 's' : ''} · id: {gate.id.slice(0, 8)}...
                  </p>
                  {gate.description && <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.8rem', margin: '0 0 0.25rem 0' }}>{gate.description}</p>}
                  {/* Rule summaries */}
                  {(gate.rules || []).map((rule, i) => <RuleSummary key={i} rule={rule} />)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
                  <button onClick={() => handleToggleActive(gate)} className="lw-btn" style={{
                    width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.75rem',
                    backgroundColor: gate.is_active ? 'rgba(255,68,68,0.15)' : 'rgba(68,255,68,0.15)',
                    color: gate.is_active ? 'var(--lw-error)' : 'var(--lw-success)', cursor: 'pointer',
                  }}>
                    {gate.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => { setEditingGate(gate); setShowNew(false) }} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(gate.id)} disabled={deleting === gate.id} className="lw-btn" style={{
                    width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.75rem',
                    backgroundColor: 'rgba(255,68,68,0.1)', color: 'var(--lw-error)', cursor: 'pointer',
                  }}>
                    {deleting === gate.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
