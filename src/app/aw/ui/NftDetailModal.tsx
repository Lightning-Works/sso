'use client'

/**
 * AWW NFT detail modal — large (up to 85% of the viewport), two sections (image
 * left, info right) that stack on narrow screens. Layered per request:
 * darkened site → moving starfield → modal card on top, with a purple glow.
 * Description sits under the name; full raw attributes collapse at the bottom.
 * Excludes Burnable / Transferable / Backed Tokens.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePrices } from '../lib/aw/usePrices'
import { fmtUsd } from '../lib/aw/prices'
import { fmt } from '../lib/waxData'
import { AwMedia } from '@/components/AwMedia'
import type { AwNft } from '../lib/aw/nftItems'
import s from '../aw.module.css'

const isVideo = (u?: string | null) => !!u && /\.(mp4|webm|mov|m4v)$/i.test(u)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--aww-hairline, rgba(255,255,255,.08))', fontSize: 13 }}>
      <span style={{ color: 'var(--aww-text-dim)' }}>{label}</span>
      <span style={{ color: 'var(--aww-text)', textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

export function NftDetailModal({ nft, onClose }: { nft: AwNft; onClose: () => void }) {
  const prices = usePrices()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const floorUsd = nft.floorWax != null && prices ? nft.floorWax * prices.wax : null
  const raw = nft.raw || {}
  const desc = nft.description || (raw.description ? String(raw.description) : '')
  const attrEntries = Object.entries(raw)

  const media = isVideo(nft.videoUrl)
    ? <video src={nft.videoUrl!} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline style={{ width: '100%', maxHeight: '78vh', borderRadius: 10, background: '#000', objectFit: 'contain' }} />
    : (nft.thumbUrl || nft.imageUrl)
      ? <AwMedia
          src={nft.thumbUrl || nft.imageUrl}
          alt={nft.name}
          fit="contain"
          fill={false}
          maxHeight="78vh"
          radius={10}
          style={{ width: '100%' }}
        />
      : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 10, background: '#111' }} />

  const body = (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 4000, isolation: 'isolate', background: 'rgba(3,4,12,.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 3vw', overflowY: 'auto' }}
    >
      {/* light moving starfield over the darkening layer, behind the card */}
      <div className={s.modalStars} aria-hidden />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexWrap: 'wrap', gap: 24,
        width: 'min(1200px, 85vw)', maxHeight: '85vh', overflowY: 'auto',
        // Opaque base under the (possibly translucent) surface so stars never bleed through.
        backgroundColor: '#0b0b12',
        backgroundImage: 'linear-gradient(var(--aww-surface, #14141c), var(--aww-surface, #14141c))',
        border: '1px solid var(--aww-border, rgba(255,255,255,.14))', borderRadius: 14, padding: 24,
        boxShadow: '0 0 60px color-mix(in srgb, var(--aww-primary, #8b5cf6) 55%, transparent), 0 0 140px color-mix(in srgb, var(--aww-primary, #8b5cf6) 30%, transparent)',
      }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 18, zIndex: 2, background: 'rgba(0,0,0,.45)', border: '1px solid var(--aww-border,rgba(255,255,255,.15))', color: 'var(--aww-text)', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', fontSize: 17 }}>×</button>

        {/* LEFT — image, larger */}
        <div style={{ flex: '1 1 46%', minWidth: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {media}
        </div>

        {/* RIGHT — info */}
        <div style={{ flex: '1 1 40%', minWidth: 0 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 26, color: 'var(--aww-text)', fontFamily: 'var(--aww-font-head, inherit)' }}>{nft.name}</h2>
          {desc && <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: 'color-mix(in srgb, var(--aww-text-muted, #9aa) 40%, #fff)' }}>{desc}</p>}

          <Row label="Collection">{nft.collection}</Row>
          {nft.schema && <Row label="Schema">{nft.schema}</Row>}
          {nft.rarity && <Row label="Rarity">{nft.rarity}</Row>}
          {nft.mintNumber && <Row label="Mint #">#{nft.mintNumber}{nft.maxSupply && Number(nft.maxSupply) > 0 ? ` of ${nft.maxSupply}` : ''}</Row>}
          {nft.templateId && <Row label="Template ID">{nft.templateId}</Row>}
          <Row label="Asset ID">{nft.tokenId || nft.id}</Row>
          {nft.mintedAt && <Row label="Minted">{new Date(nft.mintedAt).toLocaleDateString()}</Row>}
          {nft.owner && <Row label="Owner">{nft.owner}</Row>}
          {nft.floorWax != null && (
            <Row label="Lowest Price">{fmt(nft.floorWax)} $WAX{floorUsd != null ? ` · ${fmtUsd(floorUsd)}` : ''}</Row>
          )}

          <a href={nft.externalUrl || '#'} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 16, fontSize: 12, color: 'color-mix(in srgb, var(--aww-primary, #8b5cf6) 50%, #fff)', textDecoration: 'none' }}>
            View on AtomicHub →
          </a>

          {attrEntries.length > 0 && (
            <details style={{ marginTop: 18 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--aww-text-dim)', fontFamily: 'var(--aww-font-mono, monospace)', letterSpacing: '.04em', padding: '6px 0' }}>
                NFT Attributes ({attrEntries.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {attrEntries.map(([k, v]) => <Row key={k} label={k}>{String(v)}</Row>)}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null
}
