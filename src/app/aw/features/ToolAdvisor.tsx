'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { NftDetailModal } from '../ui/NftDetailModal'
import { fetchTools, bestForTlm, bestForNft, type Tool, type Loadout } from '../lib/aw/tools'
import { fetchNftItems, type AwNft } from '../lib/aw/nftItems'
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
  const [toolNfts, setToolNfts] = useState<AwNft[]>([])
  const [landNfts, setLandNfts] = useState<AwNft[]>([])
  const [selected, setSelected] = useState<AwNft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { fetchThumbs, applyThumbs } = useThumbnails()

  useEffect(() => {
    if (!account) { setTools([]); setToolNfts([]); setLandNfts([]); return }
    setLoading(true); setError('')
    Promise.all([
      fetchTools(account),
      fetchNftItems(account, 'tool.worlds').catch(() => [] as AwNft[]),
      fetchNftItems(account, 'land.worlds').catch(() => [] as AwNft[]),
    ])
      .then(([t, tn, ln]) => {
        setTools(t); setToolNfts(tn); setLandNfts(ln)
        fetchThumbs([...tn, ...ln], account)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false))
  }, [account, fetchThumbs])

  return (
    <>
      <PageHead title="Tool Advisor" desc="We read your tools' and land's on-chain stats and recommend the best 3-tool loadout — verified against the mining contract." />

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
        : loading ? <Card><Empty text="Reading your tools and land from the chain…" /></Card>
        : error ? <Card><p className={s.err}>⚠ {error}</p></Card>
        : (
          <>
            {tools.length === 0 ? <Card><Empty text="No mining tools found on this account." /></Card> : (
              <>
                <LoadoutCard title="Best for Trilium (luck ÷ delay)" lo={bestForTlm(tools)} />
                <LoadoutCard title="Best for NFT drops (max luck)" lo={bestForNft(tools)} />
              </>
            )}

            {/* Owned land grid — only when you have some */}
            {landNfts.length > 0 && (
              <Card title={`Your Land (${landNfts.length})`} tag="live read">
                <p className={s.empty} style={{ marginBottom: 10 }}>Mine on your own land to skip the landowner commission. A land&apos;s luck and ease add to your mining stats — tap a card for details.</p>
                <NftGrid
                  nfts={applyThumbs(landNfts as NftItem[])}
                  storageKey={`aww-mine-land-${account}`}
                  emptyMessage="No land found."
                  columns={5} mobileColumns={2} showViewTabs={false}
                  onCardClick={(n) => setSelected(n as AwNft)}
                />
              </Card>
            )}

            {/* Owned tools grid */}
            <Card title={`Your Tools (${toolNfts.length})`} tag="live read">
              {toolNfts.length === 0
                ? <Empty text="No mining tools found on this account." />
                : <NftGrid
                    nfts={applyThumbs(toolNfts as NftItem[])}
                    storageKey={`aww-mine-tools-${account}`}
                    emptyMessage="No tools found."
                    columns={5} mobileColumns={2} showViewTabs={false}
                    onCardClick={(n) => setSelected(n as AwNft)}
                  />}
            </Card>
          </>
        )}

      {selected && <NftDetailModal nft={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
