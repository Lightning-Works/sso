'use client'

import { useState } from 'react'
import s from '../aw.module.css'
import { PageHead, Card } from '../ui/primitives'

/**
 * Buy Trilium. Primary path: Transak card on-ramp. Transak's direct TLM support
 * is unconfirmed, so this opens the hosted Transak widget (no SDK dependency)
 * and the plan below documents the fallbacks. Needs NEXT_PUBLIC_TRANSAK_API_KEY.
 */
const TRANSAK_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY

export default function BuyTrilium() {
  const [amount, setAmount] = useState('50')

  function openTransak() {
    const params = new URLSearchParams({
      apiKey: TRANSAK_KEY || '',
      defaultCryptoCurrency: 'TLM',
      network: 'bsc',
      fiatCurrency: 'USD',
      fiatAmount: amount || '50',
    })
    window.open(`https://global.transak.com?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <PageHead title="Buy Trilium" desc="Buy TLM with a card, or swap into it — the easy on-ramp for new players." />

      <Card title="Buy with card (Transak)" tag={TRANSAK_KEY ? 'live' : 'needs API key'}>
        <div className={s.formRow}>
          <label className={s.fieldLabel}>Amount (USD)</label>
          <input
            className={s.input}
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>
        <div className={s.stubActions}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={openTransak} disabled={!TRANSAK_KEY}>
            {TRANSAK_KEY ? 'Buy Trilium with Transak' : 'Add Transak API key to enable'}
          </button>
        </div>
        {!TRANSAK_KEY && (
          <p className={s.empty} style={{ marginTop: 10 }}>
            Set <b>NEXT_PUBLIC_TRANSAK_API_KEY</b> to enable the card on-ramp.
          </p>
        )}
      </Card>

      <Card title="How buying Trilium works" tag="plan">
        <ol className={s.stub}>
          <li><b>Direct (best):</b> if Transak lists TLM, buy TLM straight to your wallet with a card.</li>
          <li><b>WAX route:</b> if not, buy WAX via Transak, then auto-swap WAX → TLM on Alcor (WAX DEX) behind the scenes.</li>
          <li><b>BSC route:</b> or buy USDT via Transak on Binance Smart Chain, then auto-swap USDT → TLM on a BSC DEX (e.g. PancakeSwap).</li>
        </ol>
        <p className={s.empty} style={{ marginTop: 10 }}>
          The wallet picks the cheapest available route automatically. Direct TLM support and the swap routing are confirmed during the build.
        </p>
      </Card>
    </>
  )
}
