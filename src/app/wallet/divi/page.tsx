'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getDiviBalances } from '@/lib/wallets/balances/divi-balances'
import { getTokenPrices } from '@/lib/wallets/balances/prices'
import { validateDiviAddress } from '@/lib/wallets/divi'
import { TokenGrid } from '@/components/TokenGrid'
import { createClient } from '@/lib/supabase/client'
import type { WalletToken } from '@/lib/wallets/types'

interface Favorite { id: string; address: string; label: string | null }

const EXPLORER = (addr: string) =>
  `https://chainz.cryptoid.info/divi/address.dws?${encodeURIComponent(addr)}.htm`

function DiviPortfolioContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const address = searchParams.get('address') || ''
  const supabase = useMemo(() => createClient(), [])

  const [tokens, setTokens] = useState<WalletToken[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [newAddr, setNewAddr] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [msg, setMsg] = useState('')

  // Current signed-in user (favorites are per-user via RLS)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const loadFavorites = useCallback(async () => {
    const { data } = await supabase
      .from('favorite_addresses')
      .select('id, address, label')
      .eq('chain', 'divi')
      .order('created_at', { ascending: false })
    setFavorites((data as Favorite[]) || [])
  }, [supabase])

  useEffect(() => { if (userId) loadFavorites() }, [userId, loadFavorites])

  // Load balance for the address being viewed
  useEffect(() => {
    if (!address) return
    let cancelled = false
    setLoading(true)
    Promise.all([getDiviBalances(address), getTokenPrices()]).then(([t, p]) => {
      if (cancelled) return
      setTokens(t)
      setPrices(p)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [address])

  const addFavorite = async (addr: string, label: string) => {
    setMsg('')
    const a = addr.trim()
    if (!validateDiviAddress(a)) { setMsg('Error: that is not a valid DIVI address.'); return }
    if (!userId) { setMsg('Error: sign in to save favorites.'); return }
    const { error } = await supabase.from('favorite_addresses').upsert({
      user_id: userId, chain: 'divi', address: a, label: label.trim() || null,
    }, { onConflict: 'user_id,chain,address' })
    if (error) { setMsg('Error: ' + error.message); return }
    setNewAddr(''); setNewLabel(''); setMsg('Saved.')
    loadFavorites()
  }

  const removeFavorite = async (id: string) => {
    const { error } = await supabase.from('favorite_addresses').delete().eq('id', id)
    if (error) { setMsg('Error: ' + error.message); return }
    loadFavorites()
  }

  const isViewedSaved = favorites.some(f => f.address === address)

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '60rem', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 className="lw-heading-xl" style={{ margin: 0 }}>Divi Portfolio</h1>
            {address && (
              <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                {address.slice(0, 10)}...{address.slice(-8)}{' · '}
                <a href={EXPLORER(address)} target="_blank" rel="noopener noreferrer" className="lw-link">explorer ↗</a>
              </p>
            )}
          </div>
          <a href="/account" className="lw-btn lw-btn-connect" style={{ width: 'auto', textDecoration: 'none', padding: '0.5rem 1.5rem' }}>← Back</a>
        </div>

        {msg && (
          <div style={{
            padding: '0.6rem 1rem', marginBottom: '1rem', borderRadius: 'var(--lw-radius-sm)', textAlign: 'center',
            background: msg.startsWith('Error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)',
            color: msg.startsWith('Error') ? 'var(--lw-error)' : 'var(--lw-success)',
          }}>{msg}</div>
        )}

        {address && (
          <div className="lw-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="lw-section-title" style={{ margin: 0 }}>Balance</h2>
              {userId && !isViewedSaved && (
                <button onClick={() => addFavorite(address, '')} className="lw-btn lw-btn-secondary"
                  style={{ width: 'auto', padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>★ Save to favorites</button>
              )}
            </div>
            {loading
              ? <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Loading balance…</p>
              : <TokenGrid tokens={tokens} prices={prices} nativeSymbol="DIVI" storageKey={`token-spam-divi-${address}`} />}
          </div>
        )}

        {/* Favorites */}
        <div className="lw-section" style={{ marginTop: address ? '1.5rem' : 0 }}>
          <h2 className="lw-section-title">Saved Divi Addresses</h2>

          {!userId && (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
              <a href="/login" className="lw-link">Sign in</a> to save favorite Divi addresses.
            </p>
          )}

          {userId && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <input className="lw-input" style={{ backgroundColor: 'rgb(26,17,46)', color: '#bab1a8', flex: 2, minWidth: '220px' }}
                  placeholder="DIVI address (starts with D)" value={newAddr} onChange={e => setNewAddr(e.target.value)} />
                <input className="lw-input" style={{ backgroundColor: 'rgb(26,17,46)', color: '#bab1a8', flex: 1, minWidth: '140px' }}
                  placeholder="Label (optional)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
                <button onClick={() => addFavorite(newAddr, newLabel)} className="lw-btn lw-btn-primary"
                  style={{ width: 'auto', padding: '0.5rem 1.25rem' }}>Add</button>
              </div>

              {favorites.length === 0
                ? <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No saved addresses yet.</p>
                : favorites.map(f => (
                  <div key={f.id} className="lw-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.9rem', marginBottom: '0.4rem' }}>
                    <div style={{ minWidth: 0 }}>
                      {f.label && <span style={{ color: 'var(--lw-text-white)', fontWeight: 500, marginRight: '0.5rem' }}>{f.label}</span>}
                      <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                        {f.address.slice(0, 12)}…{f.address.slice(-8)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button onClick={() => router.push(`/wallet/divi?address=${encodeURIComponent(f.address)}`)}
                        className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '0.25rem 0.8rem', fontSize: '0.78rem' }}>View</button>
                      <button onClick={() => removeFavorite(f.id)} className="lw-btn" style={{
                        width: 'auto', padding: '0.25rem 0.7rem', fontSize: '0.78rem',
                        backgroundColor: 'rgba(255,68,68,0.12)', color: 'var(--lw-error)', cursor: 'pointer',
                      }}>✕</button>
                    </div>
                  </div>
                ))}
            </>
          )}
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
