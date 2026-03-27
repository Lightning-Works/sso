'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface NftItem {
  id: string
  name: string
  imageUrl: string | null
  videoUrl?: string | null
  collection: string
  description?: string | null
  chain?: string
  rarity?: string | null
  mintNumber?: string | null
  maxSupply?: string | null
  tokenType?: string
  floorPrice?: number | null
  floorPriceSymbol?: string
  externalUrl?: string | null
  attributes?: { key: string; value: string }[]
}

type NftTag = 'spam' | 'favorite' | 'hidden'

interface NftTagData {
  spam: Set<string>
  favorite: Set<string>
  hidden: Set<string>
}

function loadTags(storageKey: string): NftTagData {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { spam: new Set(), favorite: new Set(), hidden: new Set() }
    const parsed = JSON.parse(raw)
    return {
      spam: new Set(parsed.spam || []),
      favorite: new Set(parsed.favorite || []),
      hidden: new Set(parsed.hidden || []),
    }
  } catch { return { spam: new Set(), favorite: new Set(), hidden: new Set() } }
}

function saveTags(storageKey: string, tags: NftTagData) {
  localStorage.setItem(storageKey, JSON.stringify({
    spam: [...tags.spam],
    favorite: [...tags.favorite],
    hidden: [...tags.hidden],
  }))
}

interface NftGridProps {
  nfts: NftItem[]
  loading?: boolean
  emptyMessage?: string
  aspectRatio?: string
  columns?: number
  mobileColumns?: number
  gap?: string
  mobileGap?: string
  mobileBreakpoint?: number
  /** Unique key for persisting spam/favorite/hidden state (e.g. wallet address) */
  storageKey?: string
  /** If true, shows "Global Spam" option in context menu (superadmin) */
  isSuperadmin?: boolean
}

export function NftGrid({
  nfts,
  loading = false,
  emptyMessage = 'No NFTs found',
  aspectRatio = '1',
  columns = 5,
  mobileColumns = 3,
  gap = '1rem',
  mobileGap = '0.5rem',
  mobileBreakpoint = 768,
  storageKey = 'nft-tags',
  isSuperadmin = false,
}: NftGridProps) {
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState<NftTagData>({ spam: new Set(), favorite: new Set(), hidden: new Set() })
  const [viewMode, setViewMode] = useState<'all' | 'spam'>('all')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [globalBlacklist, setGlobalBlacklist] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number>(-1)

  // Load tags from localStorage
  useEffect(() => {
    setTags(loadTags(storageKey))
  }, [storageKey])

  // Fetch global blacklist
  useEffect(() => {
    fetch('/api/nft-blacklist')
      .then(r => r.json())
      .then(data => setGlobalBlacklist(new Set(data.ids || [])))
      .catch(() => {})
  }, [])

  // Keyboard: Escape closes lightbox or context menu
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (contextMenu) { setContextMenu(null); setConfirmDelete(false) }
      else if (selectedNft) setSelectedNft(null)
      else if (selected.size > 0) setSelected(new Set())
    }
  }, [contextMenu, selectedNft, selected])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => { setContextMenu(null); setConfirmDelete(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const applyTag = useCallback((tag: NftTag) => {
    const next = { spam: new Set(tags.spam), favorite: new Set(tags.favorite), hidden: new Set(tags.hidden) }
    selected.forEach(id => {
      if (tag === 'spam') {
        next.spam.add(id)
        next.favorite.delete(id)
      } else if (tag === 'favorite') {
        next.favorite.has(id) ? next.favorite.delete(id) : next.favorite.add(id)
        next.spam.delete(id)
      } else if (tag === 'hidden') {
        next.hidden.add(id)
      }
    })
    setTags(next)
    saveTags(storageKey, next)
    setSelected(new Set())
    setContextMenu(null)
    setConfirmDelete(false)
  }, [tags, selected, storageKey])

  const unspamSelected = useCallback(() => {
    const next = { ...tags, spam: new Set(tags.spam) }
    selected.forEach(id => next.spam.delete(id))
    setTags(next)
    saveTags(storageKey, next)
    setSelected(new Set())
    setContextMenu(null)
  }, [tags, selected, storageKey])

  const addToGlobalBlacklist = useCallback(async () => {
    const items = nfts
      .filter(n => selected.has(n.id))
      .map(n => ({
        nft_id: n.id,
        chain: n.chain || '',
        contract: '',
        collection: n.collection || '',
      }))
    try {
      await fetch('/api/nft-blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const next = new Set(globalBlacklist)
      items.forEach(i => next.add(i.nft_id))
      setGlobalBlacklist(next)
    } catch { /* ignore */ }
    // Also mark as local spam
    applyTag('spam')
  }, [nfts, selected, globalBlacklist, applyTag])

  // Filter and sort NFTs
  const visibleNfts = nfts.filter(nft => {
    if (tags.hidden.has(nft.id)) return false
    if (globalBlacklist.has(nft.id) && viewMode !== 'spam') return false
    if (viewMode === 'spam') return tags.spam.has(nft.id) || globalBlacklist.has(nft.id)
    return !tags.spam.has(nft.id)
  })

  // Sort favorites to top (only in 'all' view)
  if (viewMode === 'all') {
    visibleNfts.sort((a, b) => {
      const aFav = tags.favorite.has(a.id) ? 0 : 1
      const bFav = tags.favorite.has(b.id) ? 0 : 1
      return aFav - bFav
    })
  }

  const spamCount = nfts.filter(n => (tags.spam.has(n.id) || globalBlacklist.has(n.id)) && !tags.hidden.has(n.id)).length

  const handleCardClick = (nft: NftItem, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndex.current >= 0) {
      // Shift-click: select range
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const next = new Set(selected)
      for (let i = start; i <= end; i++) {
        next.add(visibleNfts[i].id)
      }
      setSelected(next)
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd-click: toggle single
      const next = new Set(selected)
      next.has(nft.id) ? next.delete(nft.id) : next.add(nft.id)
      setSelected(next)
    } else if (selected.size > 0) {
      // If items are selected, clicking without modifier deselects all
      setSelected(new Set())
    } else {
      // Normal click: open lightbox
      setSelectedNft(nft)
    }
    lastClickedIndex.current = index
  }

  const handleContextMenu = (e: React.MouseEvent, nft: NftItem) => {
    e.preventDefault()
    // If right-clicked item isn't in selection, select only it
    if (!selected.has(nft.id)) {
      setSelected(new Set([nft.id]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY })
    setConfirmDelete(false)
  }

  return (
    <>
      <style>{`
        /* ── NFT Grid ── */
        .nft-grid {
          --nft-grid-columns: ${columns};
          --nft-grid-gap: ${gap};
          --nft-grid-aspect: ${aspectRatio};

          display: grid;
          grid-template-columns: repeat(var(--nft-grid-columns), 1fr);
          gap: var(--nft-grid-gap);
        }
        @media (max-width: ${mobileBreakpoint}px) {
          .nft-grid {
            --nft-grid-columns: ${mobileColumns};
            --nft-grid-gap: ${mobileGap};
          }
        }

        /* ── Card ── */
        .nft-card {
          background: var(--nft-card-bg, var(--lw-wallet-row-bg, #1a1a1c));
          border-radius: var(--nft-card-radius, var(--lw-radius-sm, 4px));
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.15s, outline 0.1s;
          position: relative;
          outline: 2px solid transparent;
          user-select: none;
        }
        .nft-card:hover { transform: scale(1.03); }
        .nft-card--selected { outline: 2px solid var(--lw-purple, #6a24fa); }

        .nft-card-heart {
          position: absolute;
          top: 6px;
          left: 6px;
          z-index: 2;
          font-size: 0.9rem;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7));
          pointer-events: none;
        }

        .nft-card-thumb {
          width: 100%;
          aspect-ratio: var(--nft-grid-aspect);
          background: var(--nft-thumb-bg, #1a1a1c);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .nft-card-thumb img,
        .nft-card-thumb video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .nft-card-info {
          padding: var(--nft-card-padding, 0.5rem 0.6rem);
        }
        .nft-card-name {
          color: var(--lw-text-white, #fff);
          font-size: var(--nft-card-name-size, 0.8rem);
          font-weight: 500;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .nft-card-collection {
          color: var(--lw-text-muted, #7a7572);
          font-size: var(--nft-card-sub-size, 0.65rem);
          margin: 0.15rem 0 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .nft-card-rarity {
          color: var(--nft-accent, var(--lw-accent, #ff8800));
          font-size: var(--nft-card-meta-size, 0.6rem);
          margin: 0.15rem 0 0 0;
          text-transform: capitalize;
        }
        .nft-card-mint {
          color: var(--lw-text-muted, #7a7572);
          font-size: var(--nft-card-meta-size, 0.6rem);
          margin: 0.15rem 0 0 0;
        }
        .nft-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.15rem;
        }
        .nft-card-chain {
          color: var(--lw-text-muted, #7a7572);
          font-size: var(--nft-card-tiny-size, 0.55rem);
        }
        .nft-card-floor {
          color: var(--nft-accent, var(--lw-accent, #ff8800));
          font-size: var(--nft-card-tiny-size, 0.55rem);
        }
        .nft-card-placeholder {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.7rem;
        }

        /* ── View Tabs ── */
        .nft-view-tabs {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .nft-view-tab {
          padding: 0.3rem 0.7rem;
          border-radius: 6px;
          border: none;
          font-size: 0.7rem;
          font-weight: 500;
          cursor: pointer;
        }

        /* ── Context Menu ── */
        .nft-context-menu {
          position: fixed;
          z-index: 10000;
          background: #1a1a2e;
          border: 1px solid rgba(106, 36, 250, 0.3);
          border-radius: 8px;
          padding: 4px 0;
          min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .nft-context-item {
          display: block;
          width: 100%;
          padding: 0.5rem 1rem;
          background: none;
          border: none;
          color: var(--lw-text-white, #fff);
          font-size: 0.8rem;
          text-align: left;
          cursor: pointer;
        }
        .nft-context-item:hover {
          background: rgba(106, 36, 250, 0.2);
        }
        .nft-context-item--danger {
          color: #ff4444;
        }
        .nft-context-item--danger:hover {
          background: rgba(255, 68, 68, 0.15);
        }
        .nft-context-confirm {
          display: flex;
          gap: 0.25rem;
          padding: 0.35rem 0.75rem;
        }
        .nft-context-confirm button {
          flex: 1;
          padding: 0.3rem;
          border: none;
          border-radius: 4px;
          font-size: 0.7rem;
          cursor: pointer;
        }

        /* ── Lightbox Overlay ── */
        .nft-lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: var(--nft-lightbox-z, 9999);
          background: var(--nft-lightbox-bg, rgba(0, 0, 0, 0.8));
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        /* ── Lightbox Panel ── */
        .nft-lightbox-panel {
          background: var(--nft-card-bg, var(--lw-wallet-row-bg, #1a1a1c));
          border-radius: 12px;
          max-width: var(--nft-lightbox-max-w, 700px);
          width: 100%;
          max-height: 90vh;
          overflow: auto;
          position: relative;
          box-shadow:
            0 0 15px 5px rgba(80, 40, 200, 0.5),
            0 0 40px 15px rgba(60, 30, 160, 0.35),
            0 0 80px 30px rgba(40, 20, 120, 0.25),
            0 0 160px 60px rgba(20, 10, 60, 0.15);
        }
        .nft-lightbox-close {
          position: sticky;
          top: 8px;
          float: right;
          margin-right: 8px;
          background: rgba(0, 0, 0, 0.5);
          border: none;
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          line-height: 1;
          z-index: 10;
        }

        .nft-lightbox-media {
          width: 100%;
          max-height: var(--nft-lightbox-media-h, 450px);
          background: var(--nft-thumb-bg, #0d0d0d);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px 12px 0 0;
          overflow: hidden;
        }
        .nft-lightbox-media img,
        .nft-lightbox-media video {
          max-width: 100%;
          max-height: var(--nft-lightbox-media-h, 450px);
          object-fit: contain;
        }

        .nft-lightbox-body { padding: 1.25rem; }
        .nft-lightbox-title {
          color: var(--lw-text-white, #fff);
          margin: 0 0 0.25rem 0;
          font-size: 1.3rem;
        }
        .nft-lightbox-subtitle {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.85rem;
          margin: 0 0 1rem 0;
        }
        .nft-lightbox-desc {
          color: var(--lw-text-secondary, #bab1a8);
          font-size: 0.85rem;
          margin: 0 0 1rem 0;
          line-height: 1.5;
        }

        .nft-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }
        .nft-detail-cell {
          background: rgba(0, 0, 0, 0.3);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
        }
        .nft-detail-label {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.7rem;
          margin: 0;
        }
        .nft-detail-value {
          color: var(--lw-text-white, #fff);
          font-size: 0.85rem;
          margin: 0.15rem 0 0 0;
        }
        .nft-detail-value--accent {
          color: var(--nft-accent, var(--lw-accent, #ff8800));
        }
        .nft-detail-value--mono {
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .nft-attr-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-top: 1rem;
        }
        .nft-attr-label {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .nft-attr-tag {
          background: var(--nft-attr-bg, rgba(106, 36, 250, 0.15));
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }
      `}</style>

      {/* View tabs */}
      {!loading && nfts.length > 0 && (
        <div className="nft-view-tabs">
          {selected.size > 0 && (
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', alignSelf: 'center', marginRight: 'auto' }}>
              {selected.size} selected — right-click for options
            </span>
          )}
          <button
            className="nft-view-tab"
            onClick={() => { setViewMode('all'); setSelected(new Set()) }}
            style={{
              backgroundColor: viewMode === 'all' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
              color: viewMode === 'all' ? '#fff' : 'var(--lw-text-muted)',
            }}
          >
            NFTs
          </button>
          <button
            className="nft-view-tab"
            onClick={() => { setViewMode('spam'); setSelected(new Set()) }}
            style={{
              backgroundColor: viewMode === 'spam' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.08)',
              color: viewMode === 'spam' ? '#fff' : 'var(--lw-text-muted)',
              opacity: spamCount > 0 ? 1 : 0.4,
            }}
          >
            Spam {spamCount > 0 && `(${spamCount})`}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--lw-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Loading NFTs...</p>
      ) : visibleNfts.length === 0 ? (
        <p className="nft-card-placeholder">{viewMode === 'spam' ? 'No spam NFTs' : emptyMessage}</p>
      ) : (
        <div className="nft-grid">
          {visibleNfts.map((nft, i) => (
            <div
              key={`${nft.id}-${i}`}
              className={`nft-card${selected.has(nft.id) ? ' nft-card--selected' : ''}`}
              onClick={(e) => handleCardClick(nft, i, e)}
              onContextMenu={(e) => handleContextMenu(e, nft)}
            >
              {tags.favorite.has(nft.id) && <span className="nft-card-heart" style={{ color: '#ff3355' }}>&#9829;</span>}
              <div className="nft-card-thumb">
                {nft.videoUrl ? (
                  <video src={nft.videoUrl} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline />
                ) : nft.imageUrl ? (
                  <img src={nft.imageUrl} alt={nft.name} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <span className="nft-card-placeholder">No image</span>
                )}
              </div>
              <div className="nft-card-info">
                <p className="nft-card-name">{nft.name}</p>
                <p className="nft-card-collection">{nft.collection}</p>
                {nft.rarity && <p className="nft-card-rarity">{nft.rarity}</p>}
                {nft.mintNumber && nft.maxSupply && nft.maxSupply !== '0' && (
                  <p className="nft-card-mint">Mint #{nft.mintNumber} / {nft.maxSupply}</p>
                )}
                {(nft.chain || nft.floorPrice != null) && (
                  <div className="nft-card-footer">
                    {nft.chain && <span className="nft-card-chain">{nft.chain}</span>}
                    {nft.floorPrice != null && (
                      <span className="nft-card-floor">Floor: {nft.floorPrice.toFixed(3)} {nft.floorPriceSymbol || 'ETH'}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div className="nft-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          {viewMode === 'spam' ? (
            <button className="nft-context-item" onClick={() => unspamSelected()}>
              &#x2716; Remove from Spam
            </button>
          ) : (
            <>
              <button className="nft-context-item" onClick={() => applyTag('spam')}>
                &#x26A0; Mark as Spam
              </button>
              {isSuperadmin && (
                <button className="nft-context-item" onClick={() => addToGlobalBlacklist()} style={{ color: '#ff8800' }}>
                  &#x26A0; Global Spam (all users)
                </button>
              )}
              <button className="nft-context-item" onClick={() => applyTag('favorite')}>
                &#9829; {selected.size === 1 && tags.favorite.has([...selected][0]) ? 'Remove Favorite' : 'Favorite'}
              </button>
              {!confirmDelete ? (
                <button className="nft-context-item nft-context-item--danger" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}>
                  &#x2716; Hide
                </button>
              ) : (
                <div className="nft-context-confirm">
                  <button style={{ background: '#ff4444', color: '#fff' }} onClick={() => applyTag('hidden')}>Confirm Hide</button>
                  <button style={{ background: '#3a3938', color: '#aaa' }} onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}>Cancel</button>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}

      {/* Lightbox */}
      {selectedNft && typeof document !== 'undefined' && createPortal(
        <div className="nft-lightbox-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedNft(null) }}>
          <div className="nft-lightbox-panel">
            <button className="nft-lightbox-close" onClick={() => setSelectedNft(null)} aria-label="Close">&#x2715;</button>

            <div className="nft-lightbox-media">
              {selectedNft.videoUrl ? (
                <video src={selectedNft.videoUrl} poster={selectedNft.imageUrl || undefined} autoPlay loop muted playsInline controls />
              ) : selectedNft.imageUrl ? (
                <img src={selectedNft.imageUrl} alt={selectedNft.name} />
              ) : (
                <div style={{ padding: '4rem' }} className="nft-card-placeholder">No image available</div>
              )}
            </div>

            <div className="nft-lightbox-body">
              <h2 className="nft-lightbox-title">{selectedNft.name}</h2>
              <p className="nft-lightbox-subtitle">
                {selectedNft.collection}
                {selectedNft.chain && ` · ${selectedNft.chain}`}
                {selectedNft.tokenType && ` · ${selectedNft.tokenType}`}
              </p>

              {selectedNft.description && <p className="nft-lightbox-desc">{selectedNft.description}</p>}

              <div className="nft-detail-grid">
                {selectedNft.rarity && (
                  <div className="nft-detail-cell">
                    <p className="nft-detail-label">Rarity</p>
                    <p className="nft-detail-value nft-detail-value--accent" style={{ textTransform: 'capitalize' }}>{selectedNft.rarity}</p>
                  </div>
                )}
                {selectedNft.mintNumber && (
                  <div className="nft-detail-cell">
                    <p className="nft-detail-label">Mint</p>
                    <p className="nft-detail-value">
                      #{selectedNft.mintNumber}{selectedNft.maxSupply && selectedNft.maxSupply !== '0' ? ` / ${selectedNft.maxSupply}` : ''}
                    </p>
                  </div>
                )}
                <div className="nft-detail-cell">
                  <p className="nft-detail-label">ID</p>
                  <p className="nft-detail-value nft-detail-value--mono">
                    {selectedNft.id.length > 16 ? `${selectedNft.id.slice(0, 8)}...${selectedNft.id.slice(-6)}` : selectedNft.id}
                  </p>
                </div>
                {selectedNft.floorPrice != null && (
                  <div className="nft-detail-cell">
                    <p className="nft-detail-label">Floor Price</p>
                    <p className="nft-detail-value nft-detail-value--accent">{selectedNft.floorPrice.toFixed(4)} {selectedNft.floorPriceSymbol || 'ETH'}</p>
                  </div>
                )}
                {selectedNft.chain && (
                  <div className="nft-detail-cell">
                    <p className="nft-detail-label">Chain</p>
                    <p className="nft-detail-value">{selectedNft.chain}</p>
                  </div>
                )}
              </div>

              {selectedNft.attributes && selectedNft.attributes.length > 0 && (
                <div>
                  <p className="nft-attr-label">Attributes</p>
                  <div className="nft-attr-list">
                    {selectedNft.attributes.map(({ key, value }) => (
                      <div key={key} className="nft-attr-tag">
                        <span style={{ color: 'var(--lw-text-muted)' }}>{key}: </span>
                        <span style={{ color: 'var(--lw-text-white)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNft.externalUrl && (
                <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                  <a href={selectedNft.externalUrl} target="_blank" rel="noopener noreferrer" className="lw-link" style={{ fontSize: '0.85rem' }}>
                    View Details →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
