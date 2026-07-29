'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { fetchTools, bestForTlm, bestForNft, combine, type Tool, type Loadout } from '../lib/aw/tools'
import type { FeatureProps } from './ctx'

function LoadoutCard({ title, tag, lo, metric }: { title: string; tag: string; lo: Loadout; metric: string }) {
  return (
    <Card title={title} tag={tag}>
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
            <span>Combined cooldown</span><b>{lo.delay}s</b>
            <span>Mines / hour</span><b>{lo.minesPerHr.toFixed(1)}</b>
            <span>Total NFT luck</span><b>{lo.luck}</b>
            <span>{metric}</span><b>{metric.includes('NFT') ? lo.nftPerHr : lo.minesPerHr.toFixed(1)}</b>
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
      <PageHead title="Tool Advisor" desc="We read your tools' on-chain stats and recommend the best 3-tool loadout." />

      <Card title="How tool choice works" tag="analysis">
        <ul className={s.stub}>
          <li>Your bag holds <b>3 tools</b>; their <b>delay</b> (cooldown) combines, so mining frequency = 3600 / total delay.</li>
          <li>TLM per mine is set by your <b>Land + planet pool</b> — so more frequent mining = more TLM. Lowest total delay wins.</li>
          <li><b>Luck</b> drives NFT drops; <b>ease</b> lowers the proof-of-work (faster on slower devices).</li>
          <li>Shining a tool raises luck but also raises delay — great for NFT farming, a slight cost to raw TLM rate.</li>
        </ul>
      </Card>

      {!account ? <Card><Empty text="Load or connect a WAX account to analyze your tools." /></Card>
        : loading ? <Card><Empty text="Reading your tools from the chain…" /></Card>
        : error ? <Card><p className={s.err}>⚠ {error}</p></Card>
        : tools.length === 0 ? <Card><Empty text="No mining tools found on this account." /></Card>
        : (
          <>
            <LoadoutCard title="Best for Trilium" tag="recommended" lo={bestForTlm(tools)} metric="TLM rate (mines/hr)" />
            <LoadoutCard title="Best for NFT drops" tag="recommended" lo={bestForNft(tools)} metric="NFT luck / hr (relative)" />
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
              <p className={s.empty} style={{ marginTop: 10 }}>Current single-loadout score: {combine(tools.slice(0, 3)).minesPerHr.toFixed(1)} mines/hr.</p>
            </Card>
          </>
        )}
    </>
  )
}
