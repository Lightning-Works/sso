'use client'

/**
 * Send — transfer WAX, Trilium or planet tokens to another WAX account.
 * Two steps in one card: fill the form → review → sign. The signer is the
 * connected Cloud Wallet (wax.signer); balances are read from the loaded
 * account's holdings. Transfer + recipient-exists logic is shared with the
 * main wallet page (src/lib/wallets/waxTransfer).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fmt, fmtCoin, planetColor } from '../lib/waxData'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import { useWax } from '../lib/aw/useWax'
import { buildTokenTransferAction, checkAccountExists, WAX_TOKEN_REGISTRY } from '@/lib/wallets/waxTransfer'
import type { FeatureProps } from './ctx'
import s from '../aw.module.css'

const EXPLORER = 'https://wax.bloks.io/transaction/'
const COIN_ICON: Record<string, string> = {
  WAX: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/wax/large.png',
  TLM: '/aww/trilium.webp',
}
const ACCOUNT_RE = /^[a-z1-5.]{1,12}$/

type Recip = 'idle' | 'checking' | 'ok' | 'bad' | 'invalid'

export default function Send({ holdings, account }: FeatureProps) {
  const prices = usePrices()
  const wax = useWax()

  // Only tokens we can actually build a transfer for, and that the account holds.
  const tokens = useMemo(
    () => (holdings?.tokens ?? []).filter(t => WAX_TOKEN_REGISTRY[t.symbol.toUpperCase()] && t.amount > 0),
    [holdings],
  )
  const [sym, setSym] = useState('')
  useEffect(() => {
    if (tokens.length && !tokens.some(t => t.symbol === sym)) {
      // Default to TLM, else WAX, else the first held token.
      setSym(tokens.find(t => t.symbol === 'TLM')?.symbol || tokens.find(t => t.symbol === 'WAX')?.symbol || tokens[0].symbol)
    }
  }, [tokens, sym])

  const sel = tokens.find(t => t.symbol === sym)
  const bal = sel?.amount ?? 0

  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [recip, setRecip] = useState<Recip>('idle')
  const [stage, setStage] = useState<'form' | 'review'>('form')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [txId, setTxId] = useState('')

  // Live, debounced recipient check so a typo is caught before signing.
  const toRef = useRef('')
  useEffect(() => {
    const v = to.trim().toLowerCase()
    toRef.current = v
    if (!v) { setRecip('idle'); return }
    if (!ACCOUNT_RE.test(v)) { setRecip('invalid'); return }
    setRecip('checking')
    const id = setTimeout(async () => {
      const ok = await checkAccountExists(v)
      if (toRef.current === v) setRecip(ok ? 'ok' : 'bad')
    }, 450)
    return () => clearTimeout(id)
  }, [to])

  const amt = parseFloat(amount) || 0
  const from = wax.signer || account
  const mismatch = !!wax.signer && !!account && wax.signer !== account
  const overBalance = !mismatch && amt > bal + 1e-9
  const canReview = sel && amt > 0 && !overBalance && recip === 'ok' && !!from

  const usd = (n: number) => { const v = usdFor(sym, n, prices); return v == null ? '' : fmtUsd(v) }

  const reset = () => { setAmount(''); setMemo(''); setTo(''); setRecip('idle'); setStage('form') }

  const sign = async () => {
    if (!wax.signer) { wax.connect(); return }
    if (!sel) return
    setBusy(true); setErr('')
    try {
      const action = buildTokenTransferAction({ from: wax.signer, to: to.trim().toLowerCase(), symbol: sym, amount: amt, memo: memo.trim() })
      const r = await wax.submit([action])
      setTxId(r.transaction_id || 'sent')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed')
    } finally { setBusy(false) }
  }

  // ---- Success screen -----------------------------------------------------
  if (txId) {
    return (
      <>
        <PageHead title="Send" />
        <Card title="Sent" tag="on-chain">
          <p className={s.ok} style={{ fontSize: 15, margin: '2px 0 14px' }}>
            ✓ Sent {fmtCoin(amt, sym)} to <b style={{ color: 'var(--aww-text)' }}>{to.trim().toLowerCase()}</b>.
          </p>
          {txId !== 'sent' && (
            <a href={EXPLORER + txId} target="_blank" rel="noopener noreferrer" className={s.txLink}>
              View transaction ↗
            </a>
          )}
          <div className={s.stubActions} style={{ marginTop: 18 }}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setTxId(''); reset() }}>Send another</button>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead title="Send" desc="Send Trilium, WAX or planet tokens to another WAX account. Double-check the recipient — blockchain transfers can't be undone." />

      {!holdings ? (
        <Card tag="connect"><Empty text="Enter your WAX account above and hit Load to see what you can send." /></Card>
      ) : tokens.length === 0 ? (
        <Card tag="empty"><Empty text="No sendable tokens in this account yet." /></Card>
      ) : stage === 'form' ? (
        <Card title="Send tokens" tag="signs on-chain">
          {/* Token picker */}
          <div className={s.formLabel}>Token</div>
          <div className={s.sendTokens}>
            {tokens.map(t => {
              const on = t.symbol === sym
              const icon = COIN_ICON[t.symbol]
              return (
                <button key={t.symbol} type="button" onClick={() => setSym(t.symbol)}
                  className={`${s.sendToken} ${on ? s.sendTokenOn : ''}`}>
                  {icon
                    ? <img src={icon} alt="" className={s.sendTokenIcon} />
                    : <span className={s.sendTokenDot} style={{ background: planetColor(t.planet) }} />}
                  <span className={s.sendTokenSym}>{t.symbol}</span>
                  <span className={s.sendTokenBal}>{fmt(t.amount)}</span>
                </button>
              )
            })}
          </div>

          {/* Recipient */}
          <div className={s.formLabel} style={{ marginTop: 16 }}>Recipient account</div>
          <div className={s.sendField}>
            <input className={s.input} placeholder="e.g. alien.wam" value={to} maxLength={13}
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={e => setTo(e.target.value.toLowerCase().replace(/[^a-z1-5.]/g, ''))} />
            <span className={s.sendCheck}>
              {recip === 'checking' && <span className={s.sendMuted}>checking…</span>}
              {recip === 'ok' && <span style={{ color: 'var(--aww-success)' }}>✓ exists</span>}
              {recip === 'bad' && <span style={{ color: 'var(--aww-danger)' }}>✗ not found</span>}
              {recip === 'invalid' && <span style={{ color: 'var(--aww-danger)' }}>✗ invalid</span>}
            </span>
          </div>

          {/* Amount */}
          <div className={s.formLabel} style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between' }}>
            <span>Amount</span>
            <span className={s.sendMuted}>Balance: {fmtCoin(bal, sym)}</span>
          </div>
          <div className={s.sendField}>
            <input className={s.input} inputMode="decimal" placeholder="0.0000" value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            <button type="button" className={s.sendMax} onClick={() => setAmount(String(bal))}>MAX</button>
          </div>
          <div className={s.sendMeta}>
            {amt > 0 && usd(amt) && <span>{usd(amt)}</span>}
            {overBalance && <span style={{ color: 'var(--aww-danger)' }}>Amount exceeds your balance</span>}
          </div>

          {/* Memo */}
          <div className={s.formLabel} style={{ marginTop: 14 }}>Memo <span className={s.sendMuted}>(optional)</span></div>
          <input className={s.input} placeholder="Note to include with the transfer" value={memo} maxLength={256}
            onChange={e => setMemo(e.target.value)} />
          {sel?.symbol && WAX_TOKEN_REGISTRY[sym]?.contract === 'token.worlds' && (
            <p className={s.empty} style={{ marginTop: 8 }}>Only unstaked (liquid) planet tokens can be sent — staked amounts are locked in Syndicate voting.</p>
          )}
          {mismatch && (
            <p className={s.empty} style={{ marginTop: 8 }}>You&apos;re connected as <b style={{ color: 'var(--aww-text)' }}>{wax.signer}</b>; the transfer will send from that wallet.</p>
          )}

          <div className={s.stubActions} style={{ marginTop: 18 }}>
            {wax.signer
              ? <button className={`${s.btn} ${s.btnPrimary}`} disabled={!canReview} onClick={() => setStage('review')}>Review send</button>
              : <button className={`${s.btn} ${s.btnPrimary}`} onClick={wax.connect} disabled={wax.connecting}>{wax.connecting ? 'Connecting…' : 'Connect WAX Wallet'}</button>}
          </div>
        </Card>
      ) : (
        // ---- Review / confirm -------------------------------------------
        <Card title="Confirm send" tag="signs on-chain">
          {err && <p className={s.err}>⚠ {err}</p>}
          <div className={s.reviewBox}>
            <div className={s.reviewAmt}>
              {COIN_ICON[sym] ? <img src={COIN_ICON[sym]} alt="" className={s.sendTokenIcon} /> : <span className={s.sendTokenDot} style={{ background: planetColor(sel?.planet) }} />}
              <span>{fmt(amt)} <b>{sym}</b></span>
              {usd(amt) && <span className={s.sendMuted} style={{ fontSize: 14 }}>{usd(amt)}</span>}
            </div>
            <div className={s.reviewRow}><i>From</i><b>{from}</b></div>
            <div className={s.reviewRow}><i>To</i><b>{to.trim().toLowerCase()}</b></div>
            {memo.trim() && <div className={s.reviewRow}><i>Memo</i><b>{memo.trim()}</b></div>}
          </div>
          <p className={s.err} style={{ color: '#ff9a3c' }}>This sends real funds on the WAX network and cannot be undone.</p>
          <div className={s.stubActions} style={{ marginTop: 6 }}>
            <button className={`${s.btn} ${s.btnGhost}`} disabled={busy} onClick={() => setStage('form')}>Back</button>
            <button className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={sign}>{busy ? 'Confirm in wallet…' : 'Confirm & Sign'}</button>
          </div>
        </Card>
      )}
    </>
  )
}
