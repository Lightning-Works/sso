'use client'

/**
 * AWW NFT detail modal — horizontal two sections (image left, info right) that
 * stack on narrow screens (flex-wrap, no media query needed). Description sits
 * under the title; the full raw attribute list is a collapsed section at the
 * bottom. Excludes Burnable / Transferable / Backed Tokens per request.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePrices } from '../lib/aw/usePrices'
import { fmtUsd } from '../lib/aw/prices'
import { fmt } from '../lib/waxData'
import type { AwNft } from '../lib/aw/nftItems'

const isVideo = (u?: string | null) => !!u && /\.(mp4|webm|mov|m4v)$/i.test(u)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--aww-hairline, rgba(255,255,255,.08))', fontSize: 13 }}>
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
  const attrEntries = Object.entries(raw)

  const media = isVideo(nft.videoUrl)
    ? <video src={nft.videoUrl!} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
    : nft.imageUrl
      ? <img src={nft.imageUrl} alt={nft.name} style={{ width: '100%', borderRadius: 8, background: '#000', objectFit: 'contain' }} />
      : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: '#111' }} />

  const body = (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(3,4,12,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 20, width: '100%', maxWidth: 900, maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--aww-surface, #14141c)', border: '1px solid var(--aww-border, rgba(255,255,255,.12))', borderRadius: 12, padding: 20,
      }}>
        {/* close */}
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 20, right: 22, zIndex: 1, background: 'rgba(0,0,0,.4)', border: '1px solid var(--aww-border,rgba(255,255,255,.15))', color: 'var(--aww-text)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>×</button>

        {/* LEFT — image */}
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {media}
        </div>

        {/* RIGHT — info */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, color: 'var(--aww-text)', fontFamily: 'var(--aww-font-head, inherit)' }}>{nft.name}</h2>
          {nft.description && <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'color-mix(in srgb, var(--aww-text-muted, #9aa) 50%, #fff)' }}>{nft.description}</p>}

          <Row label="Collection">{nft.collection}</Row>
          {nft.schema && <Row label="Schema">{nft.schema}</Row>}
          {nft.rarity && <Row label="Rarity">{nft.rarity}</Row>}
          {nft.mintNumber && <Row label="Mint #">#{nft.mintNumber}{nft.maxSupply && Number(nft.maxSupply) > 0 ? ` of ${nft.maxSupply}` : ''}</Row>}
          {nft.templateId && <Row label="Template ID">{nft.templateId}</Row>}
          <Row label="Asset ID">{nft.tokenId || nft.id}</Row>
          {nft.mintedAt && <Row label="Minted">{new Date(nft.mintedAt).toLocaleDateString()}</Row>}
          {nft.owner && <Row label="Owner">{nft.owner}</Row>}
          {nft.floorWax != null && (
            <Row label="Lowest Price">
              {fmt(nft.floorWax)} $WAX{floorUsd != null ? ` · ${fmtUsd(floorUsd)}` : ''}
            </Row>
          )}

          <a href={nft.externalUrl || '#'} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: 'var(--aww-primary, #b06cff)', textDecoration: 'none' }}>
            View on AtomicHub →
          </a>

          {/* Collapsible full attributes */}
          {attrEntries.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--aww-text-dim)', fontFamily: 'var(--aww-font-mono, monospace)', letterSpacing: '.04em', padding: '6px 0' }}>
                NFT Attributes ({attrEntries.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {attrEntries.map(([k, v]) => (
                  <Row key={k} label={k}>{String(v)}</Row>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null
}
