'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getDiviBreakdown } from '@/lib/wallets/balances/divi-balances'
import { getTokenPrices } from '@/lib/wallets/balances/prices'
import { validateDiviAddress } from '@/lib/wallets/divi'
import { createClient } from '@/lib/supabase/client'
import { DiviGoWalletPanel } from '@/components/DiviGoWalletPanel'

interface Favorite { id: string; address: string; label: string | null }
interface Breakdown { spendable: number; staked: number; total: number }
interface Row { key: string; favId: string | null; address: string; label: string | null; bd: Breakdown }

const EXPLORER = (a: string) =>
  `https://chainz.cryptoid.info/divi/address.dws?${encodeURIComponent(a)}.htm`
const fmtDivi = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 })
const fmtUsd = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPrice = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation()
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ }
      }}
      title="Copy address"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: done ? 'var(--lw-success)' : 'var(--lw-text-muted)', flexShrink: 0 }}
    >
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  )
}

const PANEL: React.CSSProperties = { backgroundColor: '#0b0b0b', borderRadius: 'var(--lw-radius, 8px)', border: '1px solid rgba(255,255,255,0.06)' }
const SUBPANEL: React.CSSProperties = { backgroundColor: '#181818', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.6rem' }

function DiviLogo({ size = 44 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/divi_logo.png" alt="Divi" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />
}

function DiviPortfolioContent() {
  const searchParams = useSearchParams()
  const queryAddr = (searchParams.get('address') || '').trim()
  const supabase = useMemo(() => createClient(), [])

  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [price, setPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [newAddr, setNewAddr] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [supabase])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: favData } = await supabase
      .from('favorite_addresses')
      .select('id, address, label')
      .eq('chain', 'divi')
      .order('created_at', { ascending: false })
    const favs = (favData as Favorite[]) || []

    // A ?address= that isn't saved yet is shown as a transient row at the top.
    const transient = queryAddr && !favs.some(f => f.address === queryAddr) && validateDiviAddress(queryAddr)
      ? { id: null as string | null, address: queryAddr, label: null as string | null }
      : null

    const entries = [
      ...(transient ? [transient] : []),
      ...favs.map(f => ({ id: f.id as string | null, address: f.address, label: f.label })),
    ]

    const [prices, ...bds] = await Promise.all([
      getTokenPrices(),
      ...entries.map(e => getDiviBreakdown(e.address)),
    ])
    setPrice((prices as Record<string, number>)['DIVI'] || 0)

    const built: Row[] = entries.map((e, i) => ({
      key: e.id ?? `q:${e.address}`,
      favId: e.id,
      address: e.address,
      label: e.label,
      bd: bds[i] as Breakdown,
    }))

    // Transient (the one being viewed) stays on top; the rest sort by most DIVI.
    const transientRows = built.filter(r => r.favId === null)
    const favRows = built.filter(r => r.favId !== null).sort((a, b) => b.bd.total - a.bd.total)
    const ordered = [...transientRows, ...favRows]

    setRows(ordered)
    setExpandedKey(ordered[0]?.key ?? null) // most-DIVI (or viewed) is open by default
    setLoading(false)
  }, [supabase, queryAddr])

  useEffect(() => { load() }, [load])

  const addFavorite = async (addr: string, label: string) => {
    setMsg('')
    const a = addr.trim()
    if (!validateDiviAddress(a)) { setMsg('Error: that is not a valid DIVI address.'); return }
    if (!userId) { setMsg('Error: sign in to save addresses.'); return }
    const { error } = await supabase.from('favorite_addresses').upsert(
      { user_id: userId, chain: 'divi', address: a, label: label.trim() || null },
      { onConflict: 'user_id,chain,address' },
    )
    if (error) { setMsg('Error: ' + error.message); return }
    setNewAddr(''); setNewLabel(''); setMsg('Saved.')
    load()
  }

  const removeFavorite = async (id: string) => {
    const { error } = await supabase.from('favorite_addresses').delete().eq('id', id)
    if (error) { setMsg('Error: ' + error.message); return }
    load()
  }

  const totalUsd = rows.reduce((s, r) => s + r.bd.total, 0) * price

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '46rem', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>
        <div style={{ ...PANEL, padding: '1.5rem' }}>

          {/* Divi unit price — at the top */}
          <div style={{ textAlign: 'center', color: 'var(--lw-text-secondary)', fontSize: '0.9rem', marginBottom: '1.1rem' }}>
            1 DIVI = <strong style={{ color: 'var(--lw-text-white)' }}>{loading ? '—' : price ? fmtPrice(price) : '—'}</strong>
          </div>

          {/* Header: Divi logo + total USD */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <DiviLogo size={48} />
              <div>
                <h1 style={{ margin: 0, color: 'var(--lw-text-white)', fontFamily: 'var(--lw-font-display)', fontSize: '1.6rem' }}>Divi Portfolio</h1>
                <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.8rem' }}>
                  {rows.length} address{rows.length === 1 ? '' : 'es'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--lw-text-white)', fontSize: '1.5rem', fontWeight: 600 }}>
                {loading ? '—' : price ? fmtUsd(totalUsd) : '—'}
              </div>
              <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>total value (USD)</span>
            </div>
          </div>

          {msg && (
            <div style={{
              padding: '0.55rem 1rem', marginBottom: '1rem', borderRadius: 'var(--lw-radius-sm)', textAlign: 'center',
              background: msg.startsWith('Error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)',
              color: msg.startsWith('Error') ? 'var(--lw-error)' : 'var(--lw-success)',
            }}>{msg}</div>
          )}

          {/* Middle: the addresses */}
          {loading ? (
            <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2.5rem 0' }}>Loading balances</p>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--lw-text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>
              No Divi addresses yet. Add one below.
            </p>
          ) : rows.map(r => {
            const open = expandedKey === r.key
            return (
              <div key={r.key} style={SUBPANEL}>
                {/* Clickable header toggles the panel */}
                <div
                  onClick={() => setExpandedKey(open ? null : r.key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', cursor: 'pointer' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--lw-text-white)', fontWeight: 500 }}>
                      {r.label || (r.favId ? 'Saved address' : 'Viewing')}
                    </div>
                    <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {r.address}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--lw-text-white)', fontWeight: 600 }}>{fmtDivi(r.bd.total)} DIVI</div>
                      {price > 0 && <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem' }}>{fmtUsd(r.bd.total * price)}</div>}
                    </div>
                    <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                  </div>
                </div>

                {/* Expanded details — inside this sub-panel */}
                {open && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Full address (all digits, 2px larger than the header) + copy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.9rem' }}>
                      <span style={{ color: 'var(--lw-text-secondary)', fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}>
                        {r.address}
                      </span>
                      <CopyButton text={r.address} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', margin: '0.9rem 0' }}>
                      {[
                        ['Balance', `${fmtDivi(r.bd.spendable)} DIVI`, 'spendable'],
                        ['Staking', `${fmtDivi(r.bd.staked)} DIVI`, 'in staking vaults'],
                        ['Total', `${fmtDivi(r.bd.total)} DIVI`, price > 0 ? fmtUsd(r.bd.total * price) : ''],
                      ].map(([label, val, sub]) => (
                        <div key={label}>
                          <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem' }}>{label}</div>
                          <div style={{ color: 'var(--lw-text-white)', fontSize: '0.95rem', fontWeight: 600 }}>{val}</div>
                          {sub && <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.68rem' }}>{sub}</div>}
                        </div>
                      ))}
                    </div>
                    {r.bd.staked > 0 && (
                      <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                        {fmtDivi(r.bd.staked)} DIVI is locked in Divi staking vaults and earning staking rewards.
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <a href={EXPLORER(r.address)} target="_blank" rel="noopener noreferrer" className="lw-btn lw-btn-secondary"
                        style={{ width: 'auto', padding: '0.3rem 0.9rem', fontSize: '0.78rem', textDecoration: 'none' }}>Explorer ↗</a>
                      {r.favId
                        ? <button onClick={() => removeFavorite(r.favId!)} className="lw-btn" style={{ width: 'auto', padding: '0.3rem 0.9rem', fontSize: '0.78rem', backgroundColor: 'rgba(255,68,68,0.12)', color: 'var(--lw-error)', cursor: 'pointer' }}>Remove</button>
                        : userId && <button onClick={() => addFavorite(r.address, '')} className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.9rem', fontSize: '0.78rem' }}>★ Save</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Bottom: manage saved addresses */}
          <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ color: 'var(--lw-text-white)', fontFamily: 'var(--lw-font-display)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>
              Saved Divi Addresses
            </h2>
            {!userId ? (
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
                <a href="/login" className="lw-link">Sign in</a> to save Divi addresses.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input className="lw-input" style={{ backgroundColor: 'rgb(26,17,46)', color: '#bab1a8', flex: 2, minWidth: '210px' }}
                  placeholder="DIVI address (starts with D)" value={newAddr} onChange={e => setNewAddr(e.target.value)} />
                <input className="lw-input" style={{ backgroundColor: 'rgb(26,17,46)', color: '#bab1a8', flex: 1, minWidth: '130px' }}
                  placeholder="Label (optional)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
                <button onClick={() => addFavorite(newAddr, newLabel)} className="lw-btn lw-btn-primary"
                  style={{ width: 'auto', padding: '0.5rem 1.25rem' }}>Add</button>
              </div>
            )}
          </div>

          {/* DiviGo wallet — link form, real balance, send-with-approval polling.
              Greyed where the API key isn't set yet; activates the moment
              DIVIGO_API_KEY + DIVIGO_PROJECT_NAME land in the server env. */}
          <DiviGoWalletPanel userId={userId} diviPrice={price} />

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="/account" className="lw-link" style={{ fontSize: '0.85rem' }}>← Back to account</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DiviPortfolioPage() {
  return (
    <Suspense fallback={<div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading...</p></div>}>
      <DiviPortfolioContent />
    </Suspense>
  )
}
