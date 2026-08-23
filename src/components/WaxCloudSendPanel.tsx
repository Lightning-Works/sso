'use client'

/**
 * "Send from your WAX Cloud Wallet" panel — connects a real WAX Cloud Wallet
 * (non-custodial; the user signs every send themselves) and sends WAX/TLM/
 * planet-token balances directly on-chain.
 *
 * Balance used for the dropdown + max-amount check is always the CONNECTED
 * signer's own balance, re-fetched for that signer specifically — not the
 * `account`/`tokens` props, which describe whatever wallet this page happens
 * to be viewing and may be a different account entirely.
 */
import { useState, useEffect, useCallback } from 'react'
import { connectWax, autoLoginWax } from '@/lib/wallets/waxSession'
import { checkAccountExists, WAX_TOKEN_REGISTRY } from '@/lib/wallets/waxTransfer'
import { getWaxBalances, getSyndicateTokens, type SyndicateToken } from '@/lib/wallets/balances/wax-balances'
import type { WalletToken } from '@/lib/wallets/types'
import { WaxSendModal } from './WaxSendModal'

const PANEL_BG = '#181818'
const inputStyle: React.CSSProperties = {
  backgroundColor: 'rgb(26,17,46)',
  color: '#bab1a8',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding: '0.45rem 0.65rem',
  fontSize: '0.9rem',
}

interface SendableToken { symbol: string; available: number }

function deriveSendable(tokens: WalletToken[], syndicate: SyndicateToken[]): SendableToken[] {
  const out: SendableToken[] = []
  for (const t of tokens) {
    if (!WAX_TOKEN_REGISTRY[t.symbol.toUpperCase()]) continue
    const amt = parseFloat(t.balance)
    if (amt > 0) out.push({ symbol: t.symbol.toUpperCase(), available: amt })
  }
  for (const s of syndicate) {
    if (s.liquid > 0) out.push({ symbol: s.symbol.toUpperCase(), available: s.liquid })
  }
  return out
}

export function WaxCloudSendPanel({ account, tokens, syndicateTokens }: {
  account: string
  tokens: WalletToken[]
  syndicateTokens: SyndicateToken[]
}) {
  const [signer, setSigner] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Only populated when the connected signer differs from the account being
  // viewed — otherwise we just reuse the already-fetched `tokens`/`syndicateTokens` props.
  const [signerTokens, setSignerTokens] = useState<WalletToken[] | null>(null)
  const [signerSyndicate, setSignerSyndicate] = useState<SyndicateToken[] | null>(null)
  const [loadingSignerBalance, setLoadingSignerBalance] = useState(false)

  const [symbol, setSymbol] = useState('WAX')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [memo, setMemo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [checkingDest, setCheckingDest] = useState(false)
  const [confirm, setConfirm] = useState<{ from: string; to: string; symbol: string; amount: number; memo?: string } | null>(null)

  useEffect(() => {
    autoLoginWax().then(a => { if (a) setSigner(a) })
  }, [])

  useEffect(() => {
    if (!signer || signer === account) return
    let cancelled = false
    ;(async () => {
      setLoadingSignerBalance(true)
      try {
        const [t, s] = await Promise.all([getWaxBalances(signer), getSyndicateTokens(signer)])
        if (!cancelled) { setSignerTokens(t); setSignerSyndicate(s) }
      } finally {
        if (!cancelled) setLoadingSignerBalance(false)
      }
    })()
    return () => { cancelled = true }
  }, [signer, account])

  const sendable = deriveSendable(
    signer && signer !== account ? (signerTokens ?? []) : tokens,
    signer && signer !== account ? (signerSyndicate ?? []) : syndicateTokens,
  )

  const connect = useCallback(async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      const a = await connectWax()
      if (a) setSigner(a)
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Connection failed or was cancelled')
    }
    setConnecting(false)
  }, [])

  const submit = async () => {
    setFormError(null)
    const amt = parseFloat(amount)
    if (!signer) { setFormError('Connect your WAX wallet first'); return }
    if (!Number.isFinite(amt) || amt <= 0) { setFormError('Enter a valid amount'); return }
    const avail = sendable.find(s => s.symbol === symbol)?.available ?? 0
    if (amt > avail) { setFormError(`You only have ${avail} ${symbol} available`); return }
    const dest = destination.trim()
    if (!dest) { setFormError('Enter a destination account'); return }
    if (dest === signer) { setFormError("You can't send to your own account"); return }
    setCheckingDest(true)
    const exists = await checkAccountExists(dest)
    setCheckingDest(false)
    if (!exists) { setFormError(`WAX account "${dest}" doesn't exist`); return }
    setConfirm({ from: signer, to: dest, symbol, amount: amt, memo: memo.trim() || undefined })
  }

  return (
    <div style={{ backgroundColor: PANEL_BG, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', flex: 1, minWidth: '300px' }}>
      <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        Send from your WAX wallet
      </div>

      {!signer ? (
        <>
          <p style={{ color: 'var(--lw-text-secondary, #bab1a8)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
            Connect your WAX Cloud Wallet to send coins and tokens directly from your own account.
          </p>
          {connectError && <p style={{ color: 'var(--lw-error, #ef4444)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{connectError}</p>}
          <button onClick={connect} disabled={connecting} className="lw-btn lw-btn-primary" style={{ padding: '0.5rem 1.25rem' }}>
            {connecting ? 'Connecting…' : 'Connect WAX Wallet'}
          </button>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
            Connected as <span style={{ color: '#fff', fontFamily: 'monospace' }}>{signer}</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={inputStyle} disabled={loadingSignerBalance}>
              {sendable.length === 0 ? (
                <option value={symbol}>{loadingSignerBalance ? 'Loading…' : 'No balance'}</option>
              ) : sendable.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
            <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="Amount" style={inputStyle} />
          </div>
          {sendable.find(s => s.symbol === symbol) && (
            <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', margin: '0 0 0.5rem' }}>
              Available: {sendable.find(s => s.symbol === symbol)!.available} {symbol}
            </p>
          )}
          <input type="text" value={destination} onChange={e => setDestination(e.target.value)}
            placeholder="Destination WAX account" style={{ ...inputStyle, width: '100%', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
          <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="Memo (optional — required by some exchanges)" style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
          {formError && <p style={{ color: 'var(--lw-error, #ef4444)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{formError}</p>}
          <button onClick={submit} disabled={checkingDest || !amount.trim() || !destination.trim()} className="lw-btn lw-btn-primary" style={{ padding: '0.5rem 1.25rem' }}>
            {checkingDest ? 'Checking…' : 'Send'}
          </button>
        </>
      )}

      {confirm && (
        <WaxSendModal
          {...confirm}
          onClose={() => setConfirm(null)}
          onSuccess={() => { setAmount(''); setDestination(''); setMemo(''); if (signer === account) { /* page-level balances will show stale until next load; acceptable for phase 1 */ } }}
        />
      )}
    </div>
  )
}
