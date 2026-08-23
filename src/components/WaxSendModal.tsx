'use client'

/**
 * Final confirm-and-sign screen for a WAX token send. The caller (WaxCloudSendPanel)
 * owns the form; this component only ever shows one already-validated send and
 * asks the connected Cloud Wallet to sign it — no editing happens here, so a user
 * can't fat-finger a change after already reading the confirmation.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { transact } from '@/lib/wallets/waxSession'
import { buildTokenTransferAction } from '@/lib/wallets/waxTransfer'

export interface WaxSendModalProps {
  from: string
  to: string
  symbol: string
  amount: number
  memo?: string
  onClose: () => void
  onSuccess?: () => void
}

export function WaxSendModal({ from, to, symbol, amount, memo, onClose, onSuccess }: WaxSendModalProps) {
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  const confirm = async () => {
    setSigning(true)
    setError(null)
    try {
      const action = buildTokenTransferAction({ from, to, symbol, amount, memo })
      const result = await transact([action])
      setTxId(result.transaction_id || 'sent')
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    }
    setSigning(false)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={() => !signing && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#181818', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '1.5rem', minWidth: 'min(420px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }}>

        {txId ? (
          <>
            <h3 style={{ color: '#2ea043', margin: '0 0 .75rem', fontSize: '1.05rem', fontWeight: 700 }}>Sent</h3>
            <p style={{ color: 'var(--lw-text-secondary, #bab1a8)', fontSize: '.85rem', margin: '0 0 .5rem', lineHeight: 1.5 }}>
              {amount} {symbol.toUpperCase()} sent to {to}.
            </p>
            {txId !== 'sent' && (
              <a href={`https://wax.bloks.io/transaction/${txId}`} target="_blank" rel="noopener noreferrer"
                className="lw-link" style={{ fontSize: '.8rem', wordBreak: 'break-all' }}>
                View transaction: {txId}
              </a>
            )}
            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button onClick={onClose} className="lw-btn lw-btn-primary" style={{ padding: '.5rem 1.25rem' }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ color: '#fff', margin: '0 0 .75rem', fontSize: '1.05rem', fontWeight: 700 }}>Confirm send</h3>
            <div style={{ background: 'rgba(0,0,0,.3)', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem' }}>
              <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '.7rem', margin: '0 0 .2rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Amount</p>
              <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 .6rem' }}>{amount} {symbol.toUpperCase()}</p>
              <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '.7rem', margin: '0 0 .2rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>From</p>
              <p style={{ color: '#e4dad1', fontSize: '.85rem', fontFamily: 'monospace', margin: '0 0 .6rem' }}>{from}</p>
              <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '.7rem', margin: '0 0 .2rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>To</p>
              <p style={{ color: '#e4dad1', fontSize: '.85rem', fontFamily: 'monospace', margin: 0 }}>{to}</p>
              {memo && (
                <>
                  <p style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '.7rem', margin: '.6rem 0 .2rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Memo</p>
                  <p style={{ color: '#e4dad1', fontSize: '.85rem', margin: 0 }}>{memo}</p>
                </>
              )}
            </div>
            <p style={{ color: '#ff8800', fontSize: '.78rem', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
              This sends real WAX-network funds directly from your connected wallet. It cannot be undone.
            </p>
            {error && <p style={{ color: 'var(--lw-error, #ef4444)', fontSize: '.8rem', margin: '0 0 .75rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button type="button" disabled={signing} onClick={onClose}
                style={{ padding: '.5rem 1rem', fontSize: '.85rem', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 4, color: '#bab1a8', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" disabled={signing} onClick={confirm}
                style={{ padding: '.5rem 1.25rem', fontSize: '.85rem', fontWeight: 700, background: '#2ea043', border: 'none', borderRadius: 4, color: '#fff', cursor: signing ? 'wait' : 'pointer' }}>
                {signing ? 'Confirm in wallet…' : 'Confirm & Sign'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
