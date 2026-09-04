'use client'

/**
 * Binance (MetaMask) — connect a MetaMask wallet on BSC and show the user's
 * BNB / TLM (BEP-20) / USDT balances. The connected address is remembered and
 * reused by the Inventory's BINANCE tab to show their Alien Worlds BSC NFTs.
 */
import { useCallback, useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { connectMetaMask, fetchBscBalances, rememberedBsc, clearBsc, hasMetaMask, type BscBalances } from '../lib/aw/evmBsc'

const MUTED = 'var(--aww-text-muted, #9aa)'
const ICON: Record<string, string> = {
  BNB: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/bnb/large.png',
  TLM: '/aww/trilium.webp',
  USDT: 'https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/tether/large.png',
}
const fmt = (n: number, d = 4) => n.toLocaleString(undefined, { maximumFractionDigits: d })
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MetaMaskConnect() {
  const [addr, setAddr] = useState<string | null>(null)
  const [bal, setBal] = useState<BscBalances | null>(null)
  const [px, setPx] = useState<{ bnb: number; tlm: number }>({ bnb: 0, tlm: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setAddr(rememberedBsc()) }, [])

  const loadBalances = useCallback((a: string) => {
    fetchBscBalances(a).then(setBal).catch(() => setBal(null))
  }, [])

  useEffect(() => { if (addr) loadBalances(addr) }, [addr, loadBalances])
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin,alien-worlds&vs_currencies=usd')
      .then(r => r.json()).then(d => setPx({ bnb: Number(d?.binancecoin?.usd) || 0, tlm: Number(d?.['alien-worlds']?.usd) || 0 })).catch(() => {})
  }, [])

  const connect = async () => {
    setBusy(true); setError('')
    try { const a = await connectMetaMask(); setAddr(a); loadBalances(a) }
    catch (e) { setError(e instanceof Error ? e.message : 'Connect failed') }
    finally { setBusy(false) }
  }
  const disconnect = () => { clearBsc(); setAddr(null); setBal(null) }

  const rows = bal ? [
    { sym: 'BNB', amt: bal.bnb, usd: bal.bnb * px.bnb, name: 'BNB' },
    { sym: 'TLM', amt: bal.tlm, usd: bal.tlm * px.tlm, name: 'Trilium (BEP-20)' },
    { sym: 'USDT', amt: bal.usdt, usd: bal.usdt, name: 'Tether (BSC)' },
  ] : []

  return (
    <>
      <PageHead title="Binance (MetaMask)" desc="Connect MetaMask to see your Binance Smart Chain balances — BNB, Trilium (BEP-20) and USDT. Used for missions and the Teleporter." />
      <Card title="MetaMask · BSC" tag="live read">
        {!hasMetaMask() && !addr ? (
          <Empty text="MetaMask not detected. Install the MetaMask browser extension, then reload and connect." />
        ) : !addr ? (
          <div>
            <p className={s.empty} style={{ marginTop: 0 }}>Connect your MetaMask wallet on Binance Smart Chain.</p>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect MetaMask'}</button>
            {error && <p className={s.err} style={{ marginTop: 10 }}>⚠ {error}</p>}
          </div>
        ) : (
          <>
            <div className={s.msg} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Connected: <b style={{ color: 'var(--aww-text)' }}>{addr.slice(0, 6)}…{addr.slice(-4)}</b> on BSC</span>
              <button className={`${s.btn} ${s.btnGhost}`} onClick={disconnect}>Disconnect</button>
            </div>
            {!bal ? <Empty text="Reading BSC balances…" /> : (
              <div className={s.coinGrid} style={{ marginTop: 12 }}>
                {rows.map(r => (
                  <div key={r.sym} className={`${s.stat} ${s.coinCard}`}>
                    <img className={s.coinIcon} src={ICON[r.sym]} alt={r.sym} />
                    <div className={s.coinText}>
                      <div className={s.statVal}>{fmt(r.amt)} ${r.sym}</div>
                      <div className={s.statUsd}>{usd(r.usd)}</div>
                      <div className={s.statLabel}>{r.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <p className={s.err} style={{ marginTop: 10 }}>⚠ {error}</p>}
          </>
        )}
      </Card>
    </>
  )
}
