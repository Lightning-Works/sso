'use client'

/**
 * /admin/arweave — buy Arweave (Turbo) upload credits with a CARD or with
 * EVM crypto via MetaMask. Superadmin only. Credits fund the permanent
 * comic "double fallback" uploads (no AR token needed).
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ArweaveAdminPage() {
  const router = useRouter()
  const [ok, setOk] = useState(false)
  const [bal, setBal] = useState<{ configured: boolean; ar?: string; winc?: string; address?: string; error?: string } | null>(null)
  const [usd, setUsd] = useState(25)
  const [eth, setEth] = useState(0.01)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'superadmin') { router.push('/account'); return }
      setOk(true)
      fetch('/api/arweave/credits').then(r => r.json()).then(setBal).catch(() => setBal({ configured: false }))
    })
  }, [router])

  if (!ok) return <div className="lw-account-page"><p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '3rem' }}>Loading…</p></div>

  const buyCard = async () => {
    setBusy('card'); setMsg('')
    try {
      const r = await fetch('/api/arweave/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'failed')
      window.open(j.url, '_blank', 'noopener')
      setMsg('Card checkout opened in a new tab. Credits appear after payment confirms.')
    } catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : String(e))) }
    setBusy('')
  }

  const payMetaMask = async () => {
    setBusy('mm'); setMsg('')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eth1193 = (window as any).ethereum
      if (!eth1193) throw new Error('MetaMask not detected')
      await eth1193.request({ method: 'eth_requestAccounts' })
      const pkg: string = '@ardrive/turbo-sdk/web'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const S: any = await import(/* webpackIgnore: true */ pkg)
      const signer = new S.InjectedEthereumSigner(eth1193)
      const turbo = S.TurboFactory.authenticated({ signer, token: 'ethereum' })
      const res = await turbo.topUpWithTokens({ tokenAmount: S.ETHToTokenAmount(eth) })
      setMsg(`MetaMask top-up submitted${res?.winc ? ` (+${res.winc} winc)` : ''}. Balance updates after confirmation.`)
    } catch (e) {
      setMsg('MetaMask error: ' + (e instanceof Error ? e.message : String(e)) + ' — if the SDK signer name differs, see docs/ARWEAVE-DOUBLE-FALLBACK.md')
    }
    setBusy('')
  }

  const cell: React.CSSProperties = { background: 'var(--lw-panel, rgba(0,0,0,0.8))', borderRadius: 8, padding: '1.25rem', marginBottom: '1rem' }
  const input: React.CSSProperties = { backgroundColor: 'rgb(26,17,46)', color: '#bab1a8', width: '120px' }

  return (
    <div className="lw-account-page">
      <div style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="lw-heading-xl" style={{ margin: 0 }}>Arweave Credits</h1>
          <a href="/admin" className="lw-link" style={{ fontSize: '0.85rem' }}>← Admin</a>
        </div>

        <div style={cell}>
          <h2 className="lw-section-title" style={{ marginTop: 0 }}>Balance</h2>
          {!bal ? <p style={{ color: 'var(--lw-text-muted)' }}>Checking…</p>
            : !bal.configured ? (
              <p style={{ color: 'var(--lw-text-secondary)', fontSize: '.9rem' }}>
                Not configured. Set <code>TURBO_ETH_KEY</code> (or <code>ARWEAVE_JWK</code>) and
                <code> npm i @ardrive/turbo-sdk</code>. See docs/ARWEAVE-DOUBLE-FALLBACK.md.
              </p>
            ) : bal.error ? <p style={{ color: 'var(--lw-error)' }}>{bal.error}</p>
            : (
              <p style={{ color: 'var(--lw-text-white)' }}>
                ~{bal.ar} <span style={{ color: 'var(--lw-text-muted)' }}>credits</span>
                <br /><span style={{ color: 'var(--lw-text-muted)', fontSize: '.75rem', fontFamily: 'monospace' }}>{bal.address}</span>
              </p>
            )}
        </div>

        <div style={cell}>
          <h2 className="lw-section-title" style={{ marginTop: 0 }}>Buy with card</h2>
          <p style={{ color: 'var(--lw-text-secondary)', fontSize: '.85rem', margin: '0 0 .75rem' }}>
            Opens a hosted Stripe checkout. No AR token needed; credits fund the comic backups.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            $<input className="lw-input" style={input} type="number" min={5} max={1000} value={usd}
              onChange={e => setUsd(Number(e.target.value))} />
            <button className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '.5rem 1.25rem' }}
              disabled={busy === 'card'} onClick={buyCard}>{busy === 'card' ? '…' : 'Buy with card'}</button>
          </div>
        </div>

        <div style={cell}>
          <h2 className="lw-section-title" style={{ marginTop: 0 }}>Top up with MetaMask (EVM)</h2>
          <p style={{ color: 'var(--lw-text-secondary)', fontSize: '.85rem', margin: '0 0 .75rem' }}>
            Pays from your connected MetaMask wallet (ETH). The server upload wallet must be the
            SAME wallet (TURBO_ETH_KEY = this wallet&apos;s key) for credits to apply to backups.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input className="lw-input" style={input} type="number" min={0.001} step={0.001} value={eth}
              onChange={e => setEth(Number(e.target.value))} /> ETH
            <button className="lw-btn lw-btn-secondary" style={{ width: 'auto', padding: '.5rem 1.25rem' }}
              disabled={busy === 'mm'} onClick={payMetaMask}>{busy === 'mm' ? '…' : 'Pay with MetaMask'}</button>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '.6rem 1rem', borderRadius: 6, textAlign: 'center',
            background: msg.startsWith('Error') || msg.includes('error') ? 'rgba(255,68,68,0.2)' : 'rgba(68,255,68,0.2)',
            color: msg.startsWith('Error') || msg.includes('error') ? 'var(--lw-error)' : 'var(--lw-success)' }}>{msg}</div>
        )}
      </div>
    </div>
  )
}
