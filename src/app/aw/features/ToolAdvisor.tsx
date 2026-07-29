'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchTools, bestForTlm, bestForNft, type Tool, type Loadout } from '../lib/aw/tools'
import type { FeatureProps } from './ctx'

function LoadoutCard({ title, lo }: { title: string; lo: Loadout }) {
  return (
    <Card title={title} tag="recommended">
      {lo.tools.length === 0 ? <Empty text="Not enough tools owned." /> : (
        <>
          <div className={s.list}>
            {lo.tools.map((t, i) => (
              <div key={t.assetId || i} className={s.listRow}>
                <span>{i + 1}</span>
                <b>{t.name}{t.shine ? ` · ${t.shine}` : ''}</b>
                <span className={s.listMeta}>delay {t.delay}s · luck {t.luck} · ease {t.ease}</span>
              </div>
            ))}
          </div>
          <div className={s.review} style={{ marginTop: 12 }}>
            <span>Cooldown (≈0.8 × Σdelay)</span><b>{Math.round(lo.delay * 0.8)}s</b>
            <span>Mines / hour</span><b>{lo.minesPerHr.toFixed(1)}</b>
            <span>Total luck</span><b>{lo.luck}</b>
            <span>TLM score (luck ÷ delay)</span><b>{lo.delay ? (lo.luck / lo.delay).toFixed(3) : '—'}</b>
            <span>NFT rate (relative)</span><b>{lo.nftPerHr}</b>
          </div>
        </>
      )}
    </Card>
  )
}

export default function ToolAdvisor({ account }: FeatureProps) {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!account) { setTools([]); return }
    setLoading(true); setError('')
    fetchTools(account).then(setTools).catch(e => setError(e instanceof Error ? e.message : 'failed')).finally(() => setLoading(false))
  }, [account])

  return (
    <>
      <PageHead title="Tool Advisor" desc="We read your tools' on-chain stats and recommend the best 3-tool loadout — verified against the mining contract." />

      <Card title="How tool choice works" tag="analysis">
        <ul className={s.stub}>
          <li>Your bag holds <b>3 tools</b>; cooldown ≈ <b>0.8 × combined delay</b>, so mines/hour = 3600 ÷ that.</li>
          <li>TLM per mine scales with your <b>total luck</b> and the planet pool → <b>TLM/hour ∝ total luck ÷ total delay</b> (not just low delay).</li>
          <li><b>NFT drops ∝ total luck</b> — for NFT hunting, stack the highest-luck tools even if slower.</li>
          <li><b>ease</b> lowers the proof-of-work (helps slower devices); <b>difficulty</b> raises it. Shining raises luck <i>and</i> delay.</li>
          <li>Mine high-emission planets (<b>Neri, Kavian, Veles</b>); own your land to skip the landowner commission. Rewards claim on a 3-day cooldown.</li>
        </ul>
      </Card>

      {!account ? <Card><Empty text="Load or connect a WAX account to analyze your tools." /></Card>
        : loading ? <Card><Empty text="Reading your tools from the chain…" /></Card>
        : error ? <Card><p className={s.err}>⚠ {error}</p></Card>
        : tools.length === 0 ? <Card><Empty text="No mining tools found on this account." /></Card>
        : (
          <>
            <LoadoutCard title="Best for Trilium (luck ÷ delay)" lo={bestForTlm(tools)} />
            <LoadoutCard title="Best for NFT drops (max luck)" lo={bestForNft(tools)} />
            <Card title={`All your tools (${tools.length})`} tag="live read">
              <div className={s.list}>
                {tools.map((t, i) => (
                  <div key={t.assetId || i} className={s.listRow}>
                    <span>{i + 1}</span>
                    <b>{t.name}{t.shine ? ` · ${t.shine}` : ''}</b>
                    <span className={s.listMeta}>delay {t.delay}s · luck {t.luck} · ease {t.ease} · {t.rarity}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
    </>
  )
}
