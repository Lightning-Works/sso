'use client'

/**
 * Receive — shows the account name to receive WAX-chain tokens/NFTs, with a
 * copy button and a QR of the account name. QR is rendered locally (the qrcode
 * lib's browser build) so nothing about the account leaves the page.
 */
import { useEffect, useState } from 'react'
import { Card, Empty, PageHead } from '../ui/primitives'
import { useWax } from '../lib/aw/useWax'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

export default function Receive({ account }: FeatureProps) {
  const wax = useWax()
  const acct = account || wax.signer || ''
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!acct) { setQr(''); return }
    let live = true
    import('qrcode')
      .then(m => m.toDataURL(acct, { margin: 1, width: 320, color: { dark: '#1a1330', light: '#ffffff' } }))
      .then(url => { if (live) setQr(url) })
      .catch(() => { if (live) setQr('') })
    return () => { live = false }
  }, [acct])

  const copy = async () => {
    try { await navigator.clipboard.writeText(acct); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
  }

  return (
    <>
      <PageHead title="Receive" desc="Share your WAX account name to receive Trilium, WAX, planet tokens or NFTs. On WAX you receive to your account name — there's no separate deposit address." />
      <Card title="Your WAX account" tag="live read">
        {!acct ? (
          <Empty text="Enter your WAX account above and hit Load, or connect your wallet, to show your receive details." />
        ) : (
          <div className={s.receiveWrap}>
            <div className={s.receiveQr}>
              {qr ? <img src={qr} alt={`QR code for ${acct}`} width={220} height={220} /> : <div className={s.receiveQrEmpty}>Generating QR…</div>}
            </div>
            <div className={s.receiveInfo}>
              <div className={s.formLabel}>Account name</div>
              <div className={s.receiveName}>{acct}</div>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={copy} style={{ marginTop: 6 }}>
                {copied ? '✓ Copied' : 'Copy account name'}
              </button>
              <p className={s.empty} style={{ marginTop: 14 }}>
                Anyone can send you tokens or NFTs using this name. Always confirm the sender has the exact spelling — WAX names are case-sensitive and 12 characters or fewer.
              </p>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
