'use client'

import { useEffect, useState } from 'react'
import s from '../aw.module.css'
import { Card, Empty, PageHead } from '../ui/primitives'
import { NftGrid, type NftItem } from '@/components/NftGrid'
import { useThumbnails } from '@/lib/wallets/useThumbnails'
import { NftDetailModal } from '../ui/NftDetailModal'
import { fetchTools, bestForTlm, bestForNft, type Tool, type Loadout } from '../lib/aw/tools'
import { fetchToolOffers } from '../lib/aw/market'
import { bestValueUpgrades, type Upgrade } from '../lib/aw/advisor'
import { buildBuyActions } from '../lib/aw/buyTool'
import { useWax } from '../lib/aw/useWax'
import { fetchNftItems, type AwNft } from '../lib/aw/nftItems'
import { usePrices } from '../lib/aw/usePrices'
import { fmtUsd } from '../lib/aw/prices'
import type { FeatureProps } from './ctx'

const toolImg = (h?: string) => (h ? `https://ipfs.io/ipfs/${h}` : null)

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
  const [upgrades, setUpgrades] = useState<Upgrade[]>([])
  const [selected, setSelected] = useState<AwNft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { fetchThumbs, applyThumbs } = useThumbnails()
  const prices = usePrices()
  const wax = useWax()
  const [buyBusy, setBuyBusy] = useState('')
  const [buyMsg, setBuyMsg] = useState<{ ok?: string; err?: string }>({})

  const doBuy = async (u: Upgrade) => {
    if (!wax.signer) { wax.connect(); return }
    setBuyBusy(u.offer.saleId); setBuyMsg({})
    try {
      const r = await wax.submit(buildBuyActions(wax.signer, u.offer.saleId, u.offer.price))
      setBuyMsg({ ok: `Bought ${u.offer.name} — tx ${r.transaction_id?.slice(0, 10) ?? 'sent'}… It will appear in your tools shortly.` })
    } catch (e) {
      setBuyMsg({ err: e instanceof Error ? e.message : 'purchase failed' })
    } finally { setBuyBusy('') }
  }

  useEffect(() => {
    if (!account) { setTools([]); setToolNfts([]); setLandNfts([]); setUpgrades([]); return }
    setLoading(true); setError('')
    Promise.all([
      fetchTools(account),
      fetchNftItems(account, 'tool.worlds').catch(() => [] as AwNft[]),
      fetchNftItems(account, 'land.worlds').catch(() => [] as AwNft[]),
      fetchToolOffers(200).catch(() => []),
    ])
      .then(([t, tn, ln, offers]) => {
        setTools(t); setToolNfts(tn); setLandNfts(ln)
        setUpgrades(bestValueUpgrades(t, offers))
        fetchThumbs([...tn, ...ln], account)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false))
  }, [account, fetchThumbs])

  const usd = (wax: number) => (prices ? ` · ${fmtUsd(wax * prices.wax)}` : '')

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
                <LoadoutCard title="① Use these — best loadout from your tools" lo={bestForTlm(tools)} />
                <LoadoutCard title="Best for NFT drops (max luck)" lo={bestForNft(tools)} />
              </>
            )}

            {/* Buy recommendations — best value upgrades */}
            <Card title="② Best-value tools to buy" tag="live market">
              {upgrades.length === 0
                ? <Empty text="No upgrade found that beats your current tools for the price. You're well-equipped, or the market has no better-value tool right now." />
                : (
                  <>
                    <p className={s.empty} style={{ marginBottom: 12 }}>Ranked by improvement per $WAX spent. Buy in one tap — your wallet approves the purchase, then the tool appears in your inventory.</p>
                    {buyMsg.err && <p className={s.err} style={{ marginBottom: 10 }}>⚠ {buyMsg.err}</p>}
                    {buyMsg.ok && <p className={s.ok} style={{ marginBottom: 10 }}>{buyMsg.ok}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
                      {upgrades.map((u, i) => (
                        <div key={u.offer.saleId || i} style={{ border: '1px solid var(--aww-border)', borderRadius: 10, overflow: 'hidden', background: 'color-mix(in srgb, var(--aww-surface-2, var(--aww-surface)) 80%, transparent)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ position: 'relative', aspectRatio: '1', background: '#0b0b12' }}>
                            {toolImg(u.offer.img)
                              ? <img src={toolImg(u.offer.img)!} alt={u.offer.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                              : null}
                            <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'color-mix(in srgb, var(--aww-primary) 80%, transparent)', borderRadius: 5, padding: '1px 6px' }}>+{u.gainPct.toFixed(0)}% rate</span>
                          </div>
                          <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                            <b style={{ fontSize: 12.5, color: 'var(--aww-text)', lineHeight: 1.2 }}>{u.offer.name}{u.offer.shine ? ` · ${u.offer.shine}` : ''}</b>
                            <span style={{ fontSize: 11, color: 'var(--aww-text-dim)' }}>luck {u.offer.luck} · delay {u.offer.delay}s</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--aww-text)', marginTop: 2 }}>{u.offer.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} $WAX</span>
                            <span style={{ fontSize: 10.5, color: 'var(--aww-text-dim)', marginTop: -3 }}>{usd(u.offer.price).replace(' · ', '')}</span>
                            <button className={`${s.btn} ${s.btnPrimary}`} style={{ marginTop: 6, width: '100%', fontSize: 12 }} onClick={() => doBuy(u)} disabled={buyBusy === u.offer.saleId}>
                              {buyBusy === u.offer.saleId ? 'Buying…' : wax.signer ? 'Buy now' : 'Connect to buy'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className={s.empty} style={{ marginTop: 12 }}>&ldquo;% rate&rdquo; is the projected lift to your luck ÷ delay (a TLM/hr proxy) after equipping it. Purchases go through the on-chain AtomicMarket, approved in your wallet.</p>
                  </>
                )}
            </Card>

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
