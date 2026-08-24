'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ComicReaderDispatch } from './ComicReaderDispatch'
import { ShineBadge } from './ShineBadge'
import { AwMedia } from './AwMedia'

/** A readable comic = a comic marker + a way to resolve its pages. */
function isComic(n: NftItem): boolean {
  const attrComic = (n.attributes || []).some(a =>
    a.key.toLowerCase() === 'media type' && a.value.toLowerCase().includes('comic'))
  const marked = attrComic || /comic/i.test(n.collection || '') || /comic/i.test(n.name || '')
  if (!marked) return false
  // Resolvable if it has an on-chain bundle (animationUrl) OR a contract
  // address. Pages are keyed by contract address and shared across every mint
  // of the series, so a mint indexed WITHOUT an animation_url (it happens —
  // e.g. AW0 Starblind #266) still opens the same stored pages as its siblings.
  return !!(n.animationUrl || n.contractAddress)
}

function isUltraRare(nft: NftItem): boolean {
  if (!nft.attributes) return false
  return nft.attributes.some(a => {
    const key = a.key.toLowerCase()
    if (key !== 'ultra rare cover' && key !== 'ultra rare') return false
    const val = a.value.toLowerCase()
    return val && val !== 'no' && val !== 'none' && val !== 'false' && val !== ''
  })
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogv') || lower.endsWith('.mov')
}

// Public IPFS gateways come and go under load (ipfs.io in particular has
// gotten unreliable — see wax-nfts.ts). nftstorage.link and w3s.link aren't
// listed here because they just redirect through dweb.link/ipfs.io anyway —
// no point retrying through a middleman pointed at the gateway that just
// failed. If an <img> pointed at one of these gateways fails to load, retry
// it against the next gateway in line before giving up, so a single gateway
// outage doesn't blank out the whole grid.
const IPFS_GATEWAYS = ['dweb.link', 'ipfs.io']

/** onError handler: walks an ipfs.io/dweb.link image through the gateway
 *  list, then (once) tries `fallbackUrl`, then gives up and hides it. */
function handleImgError(fallbackUrl?: string | null) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const m = img.src.match(/^https:\/\/([^/]+)\/ipfs\/(.+)$/)
    if (m) {
      const [, host, rest] = m
      const idx = IPFS_GATEWAYS.indexOf(host)
      const nextGateway = IPFS_GATEWAYS[idx + 1]
      if (nextGateway) {
        img.src = `https://${nextGateway}/ipfs/${rest}`
        return
      }
    }
    if (fallbackUrl && img.src !== fallbackUrl && !img.dataset.triedFallback) {
      img.dataset.triedFallback = '1'
      img.src = fallbackUrl
      return
    }
    img.style.display = 'none'
  }
}

function getRarityStyle(rarity: string): { color: string; border?: string; glow?: string } {
  const r = rarity.toLowerCase().trim()
  if (r === 'common') return { color: '#c4a84a', border: '1px solid rgba(196,168,74,0.4)' }
  if (r === 'uncommon') return { color: '#4CAF50', border: '1px solid rgba(76,175,80,0.4)' }
  if (r === 'rare') return { color: '#4a9eff', border: '1px solid rgba(74,158,255,0.4)' }
  if (r === 'epic') return { color: '#a855f7', border: '1px solid rgba(168,85,247,0.5)' }
  if (r === 'legendary') return { color: '#ef4444', border: '1px solid rgba(239,68,68,0.5)' }
  if (r === 'divine') return { color: '#e0e0e0', border: '1px solid rgba(224,224,224,0.6)', glow: '0 0 8px 2px rgba(224,224,224,0.5)' }
  if (r === 'mystic') return { color: '#ff4eda', border: '1px solid rgba(255,78,218,0.6)', glow: '0 0 8px 2px rgba(255,78,218,0.5)' }
  if (r === 'rainbow') return { color: '#ff4444', border: '1px solid rgba(255,200,0,0.5)', glow: '0 0 4px 1px #ff4444, 0 0 6px 2px #ffaa00, 0 0 4px 1px #44ff44, 0 0 6px 2px #4444ff' }
  if (r === 'apocalyptic') return { color: '#ff6600', border: '1px solid rgba(255,102,0,0.6)', glow: '0 0 8px 3px rgba(255,102,0,0.6), 0 0 16px 6px rgba(255,50,0,0.3)' }
  return { color: 'var(--nft-accent, #ff8800)' }
}

export interface NftItem {
  id: string
  name: string
  imageUrl: string | null
  thumbUrl?: string | null
  videoUrl?: string | null
  collection: string
  description?: string | null
  chain?: string
  rarity?: string | null
  /** Alien Worlds shine tier (Stone/Gold/Stardust/Antimatter/XDimension). Drives
   *  the corner ShineBadge; unset on non-AW NFTs so no badge renders. */
  shine?: string | null
  mintNumber?: string | null
  maxSupply?: string | null
  tokenType?: string
  floorPrice?: number | null
  floorPriceSymbol?: string
  externalUrl?: string | null
  animationUrl?: string | null
  attributes?: { key: string; value: string }[]
  // Immutable on-chain identifier — used to key shared comic fallback pages
  // so every mint of a series resolves to the same storage row.
  contractAddress?: string
  /** On-chain token id (the specific mint within the contract). Needed
   *  for loan operations and any per-mint action. */
  tokenId?: string
  /** Loan state for this specific mint. The wallet attaches this when
   *  it fetches /api/loans/mine and merges it onto the NFT list. */
  loanState?: NftLoanState | null
}

/** Per-card loan state, attached by the wallet after it fetches loan data. */
export type NftLoanState =
  // The viewer owns this mint and has lent it out. When status is 'active'
  // the thumbnail is greyed with a "Loaned to X" overlay and reading is
  // blocked. When status is 'pending' the loan link exists but the
  // borrower hasn't claimed, so the owner can still read.
  | { kind: 'lent'; loanId: string; status: 'pending' | 'active'; toLabel: string; expiresAt: string }
  // The viewer is borrowing this mint from someone else. Always shown
  // with the green LOAN badge and the right-click "Return to owner".
  | { kind: 'borrowed'; loanId: string; fromLabel: string; expiresAt: string }

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
  /** Called after the grid mutates loans (Return/Revoke) so the parent
   *  can re-fetch /api/loans/mine and refresh the badges/overlays. */
  onLoansChanged?: () => void
  /** Show the NFTs/Spam view tabs. Off when the grid is already scoped to a
   *  single curated collection — there's no spam there and everything is an
   *  NFT, so the toggle is just noise. */
  showViewTabs?: boolean
  /** Animate tiles: show the static thumbnail, then fade in the animated original
   *  (Alien Worlds animated webp) and cache it to IndexedDB. Opt-in — off for the
   *  main wallet so its NFTs render exactly as before. */
  animate?: boolean
  /** Optional: intercept a normal tile click to render a custom detail view
   *  instead of the built-in lightbox. When omitted, the built-in lightbox is
   *  used (default behaviour — the SSO wallet relies on this). */
  onCardClick?: (nft: NftItem) => void
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
  onLoansChanged,
  showViewTabs = true,
  animate = false,
  onCardClick,
}: NftGridProps) {
  // Loan action under user confirmation. null when no action pending.
  const [loanConfirm, setLoanConfirm] = useState<{ kind: 'return' | 'revoke'; loanId: string; nftName: string; counterpartyLabel: string } | null>(null)
  const [loanBusy, setLoanBusy] = useState(false)
  const runLoanAction = async () => {
    if (!loanConfirm) return
    setLoanBusy(true)
    try {
      const path = loanConfirm.kind === 'return' ? 'return' : 'revoke'
      const r = await fetch(`/api/loans/${loanConfirm.loanId}/${path}`, { method: 'POST' })
      if (r.ok) onLoansChanged?.()
    } catch { /* */ }
    setLoanBusy(false)
    setLoanConfirm(null)
  }
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [refreshedThumbs, setRefreshedThumbs] = useState<Record<string, string>>({})
  const [tags, setTags] = useState<NftTagData>({ spam: new Set(), favorite: new Set(), hidden: new Set() })
  const [viewMode, setViewMode] = useState<'all' | 'spam'>('all')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [contextNft, setContextNft] = useState<NftItem | null>(null)
  const [readerNft, setReaderNft] = useState<NftItem | null>(null)
  // When the reader was opened via "Read Webtoon", force the webtoon layout.
  const [readerWebtoon, setReaderWebtoon] = useState(false)
  // Optional auto-action when the reader opens — used by the detail
  // modal's LOAN button so the user doesn't have to click LOAN again
  // once the reader is up.
  const [readerInitialAction, setReaderInitialAction] = useState<'loan' | null>(null)
  // Per-contract webtoon availability (lowercased address → strip count).
  const [webtoonContracts, setWebtoonContracts] = useState<Record<string, { exists: boolean; strips: number }>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [globalBlacklist, setGlobalBlacklist] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIncludeSpam, setSearchIncludeSpam] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fsZoom, setFsZoom] = useState(1)
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 })
  const [fsDragging, setFsDragging] = useState(false)
  const fsDragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const lastClickedIndex = useRef<number>(-1)

  // Load tags from localStorage
  useEffect(() => {
    setTags(loadTags(storageKey))
  }, [storageKey])

  // Distinct smart contracts present in the grid — keyed as a stable
  // string so the webtoon-status fetch doesn't re-run on every render.
  const contractsKey = useMemo(
    () => [...new Set(nfts.map(n => n.contractAddress?.toLowerCase()).filter(Boolean))].sort().join(','),
    [nfts],
  )

  // Prefetch which contracts have a webtoon (with ≥1 strip) so the
  // context menu can offer "Read Webtoon".
  useEffect(() => {
    if (!contractsKey) { setWebtoonContracts({}); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/comics/webtoon-status?contracts=${encodeURIComponent(contractsKey)}`)
        if (!r.ok || cancelled) return
        const j = await r.json() as Record<string, { exists: boolean; strips: number }>
        if (!cancelled) setWebtoonContracts(j || {})
      } catch { /* no webtoons surfaced — harmless */ }
    })()
    return () => { cancelled = true }
  }, [contractsKey])

  // Fetch global blacklist
  useEffect(() => {
    fetch('/api/nft-blacklist')
      .then(r => r.json())
      .then(data => setGlobalBlacklist(new Set(data.ids || [])))
      .catch(() => {})
  }, [])

  // Keyboard handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (fullscreen) {
      if (e.key === 'Escape' || e.key === 'Enter') { setFullscreen(false); setFsZoom(1); setFsPan({ x: 0, y: 0 }); return }
      if (e.key === '+' || e.key === '=') { setFsZoom(z => Math.min(z + 0.1, 5)); return }
      if (e.key === '-') { setFsZoom(z => Math.max(z - 0.1, 0.5)); return }
      return
    }
    if (e.key === 'Escape') {
      if (contextMenu) { setContextMenu(null); setConfirmDelete(false) }
      else if (selectedNft) setSelectedNft(null)
      else if (selected.size > 0) setSelected(new Set())
    }
  }, [contextMenu, selectedNft, selected, fullscreen])

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

  const isSpam = (id: string) => tags.spam.has(id) || globalBlacklist.has(id)

  // Search scoring
  const searchNfts = (items: NftItem[], query: string): NftItem[] => {
    if (!query) return items
    const q = query.toLowerCase()
    const scored = items
      .map(nft => {
        const name = (nft.name || '').toLowerCase()
        const desc = (nft.description || '').toLowerCase()
        let score = 0
        // Title starts with query: highest priority
        if (name.startsWith(q)) score += 100
        // Title contains query: 3x weight
        if (name.includes(q)) score += 30
        // Description contains query: 1x weight
        if (desc.includes(q)) score += 10
        return { nft, score }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map(s => s.nft)
  }

  // Filter NFTs by view mode
  let visibleNfts: NftItem[]
  if (searchQuery) {
    // When searching, include all non-hidden NFTs (optionally including spam)
    const pool = nfts.filter(nft => {
      if (tags.hidden.has(nft.id)) return false
      if (!searchIncludeSpam && isSpam(nft.id)) return false
      return true
    })
    visibleNfts = searchNfts(pool, searchQuery)
  } else {
    visibleNfts = nfts.filter(nft => {
      if (tags.hidden.has(nft.id)) return false
      if (globalBlacklist.has(nft.id) && viewMode !== 'spam') return false
      if (viewMode === 'spam') return isSpam(nft.id)
      return !tags.spam.has(nft.id)
    })

    // Sort favorites to top (only in 'all' view, not when searching)
    if (viewMode === 'all') {
      visibleNfts.sort((a, b) => {
        const aFav = tags.favorite.has(a.id) ? 0 : 1
        const bFav = tags.favorite.has(b.id) ? 0 : 1
        return aFav - bFav
      })
    }
  }

  const spamCount = nfts.filter(n => isSpam(n.id) && !tags.hidden.has(n.id)).length

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
    } else if (onCardClick) {
      // Host provided a custom detail view (e.g. AWW's modal).
      onCardClick(nft)
    } else {
      // Normal click: open lightbox
      setSelectedNft(nft)
    }
    lastClickedIndex.current = index
  }

  const handleContextMenu = (e: React.MouseEvent, nft: NftItem) => {
    e.preventDefault()
    setContextNft(nft)
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
        /* Block Pinterest browser extension on grid thumbnails only */
        .nft-card-thumb {
          pointer-events: none;
        }
        .nft-card {
          pointer-events: auto;
        }
        .nft-card-thumb [data-pin-href],
        .nft-card-thumb [data-pin-log] {
          display: none !important;
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
          font-size: var(--nft-card-meta-size, 0.6rem);
          margin: 0.15rem 0 0 0;
          text-transform: capitalize;
          font-weight: 600;
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
        /* ── Search Bar ── */
        .nft-search-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .nft-search-input {
          flex: 1;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
          color: var(--lw-text-white, #fff);
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .nft-search-input:focus {
          border-color: var(--lw-purple, #6a24fa);
        }
        .nft-search-input::placeholder {
          color: var(--lw-text-muted, #7a7572);
        }
        .nft-search-spam-label {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.7rem;
          color: var(--lw-text-muted, #7a7572);
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
        }
        .nft-search-spam-label input {
          accent-color: var(--lw-purple, #6a24fa);
          width: 13px;
          height: 13px;
          cursor: pointer;
        }

        .nft-view-tabs {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .nft-view-tab {
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          border: none;
          font-size: 0.75rem;
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

      {/* Search bar */}
      {!loading && nfts.length > 0 && (
        <div className="nft-search-bar">
          <input
            className="nft-search-input"
            type="text"
            placeholder="Search Digital Collectibles..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setViewMode('all') }}
          />
          {searchQuery && (
            <label className="nft-search-spam-label">
              <input
                type="checkbox"
                checked={searchIncludeSpam}
                onChange={e => setSearchIncludeSpam(e.target.checked)}
              />
              Include Spam
            </label>
          )}
          {searchQuery && (
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              {visibleNfts.length} result{visibleNfts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* View tabs */}
      {showViewTabs && !loading && nfts.length > 0 && !searchQuery && (
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
              backgroundColor: viewMode === 'all' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.12)',
              color: viewMode === 'all' ? '#fff' : '#bab1a8',
            }}
          >
            NFTs
          </button>
          <button
            className="nft-view-tab"
            onClick={() => { setViewMode('spam'); setSelected(new Set()) }}
            style={{
              backgroundColor: viewMode === 'spam' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.12)',
              color: viewMode === 'spam' ? '#fff' : '#bab1a8',
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
              style={(() => {
                const ur = isUltraRare(nft)
                if (ur) return {
                  backgroundColor: '#f0f0f0',
                  border: '2px solid gold',
                  boxShadow: '0 0 12px 3px rgba(255,215,0,0.5), 0 0 24px 6px rgba(255,215,0,0.25)',
                }
                if (!nft.rarity) return {}
                const rs = getRarityStyle(nft.rarity!)
                return {
                  ...(rs.border ? { border: rs.border } : {}),
                  ...(rs.glow ? { boxShadow: rs.glow } : {}),
                }
              })()}
            >
              {tags.favorite.has(nft.id) && <span className="nft-card-heart" style={{ color: '#ff3355' }}>&#9829;</span>}
              <div className="nft-card-thumb" style={{ position: 'relative' }}>
                {animate ? (
                  nft.videoUrl && isVideoUrl(nft.videoUrl) ? (
                    <video src={nft.videoUrl} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline />
                  ) : (refreshedThumbs[nft.id] || nft.thumbUrl || nft.imageUrl) ? (
                    <AwMedia
                      staticSrc={refreshedThumbs[nft.id] || nft.thumbUrl || nft.imageUrl}
                      animatedSrc={nft.imageUrl || undefined}
                      cacheKey={nft.id}
                      alt={nft.name}
                      fit="contain"
                      fill
                      placeholder="No image"
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <span className="nft-card-placeholder">No image</span>
                  )
                ) : (refreshedThumbs[nft.id] || nft.thumbUrl) ? (
                  // key on the src: when the source changes (e.g. the cached
                  // thumbnail resolves in after the raw IPFS url), React mounts a
                  // FRESH <img> instead of swapping src on the old one. A lazy
                  // <img> that already stalled won't re-fire on a src swap, which
                  // left tiles permanently black; a fresh element loads normally.
                  <img key={`t-${refreshedThumbs[nft.id] || nft.thumbUrl}`} src={refreshedThumbs[nft.id] || nft.thumbUrl!} alt={nft.name} crossOrigin="anonymous" data-pin-nopin="true" onError={handleImgError(nft.imageUrl)} />
                ) : nft.videoUrl && isVideoUrl(nft.videoUrl) ? (
                  <video src={nft.videoUrl} poster={nft.imageUrl || undefined} autoPlay loop muted playsInline />
                ) : nft.imageUrl ? (
                  <img key={`i-${nft.imageUrl}`} src={nft.imageUrl} alt={nft.name} crossOrigin="anonymous" data-pin-nopin="true" onError={handleImgError()} />
                ) : (
                  <span className="nft-card-placeholder">No image</span>
                )}
                {/* Owner side: this mint is actively loaned out — grey it
                    out + show "Loaned to X" in green over the centre. */}
                {nft.loanState?.kind === 'lent' && nft.loanState.status === 'active' && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', pointerEvents: 'none' }}>
                    <span style={{ color: '#2ea043', fontWeight: 700, fontSize: '0.85rem', textAlign: 'center', textShadow: '0 1px 2px rgba(0,0,0,.7)', lineHeight: 1.25 }}>
                      Loaned to<br />{nft.loanState.toLabel}
                    </span>
                  </div>
                )}
                {/* Borrower side: this mint is on loan to me. */}
                {nft.loanState?.kind === 'borrowed' && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)', padding: '0.2rem 0.4rem', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ color: '#2ea043', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.06em', textShadow: '0 1px 2px rgba(0,0,0,.7)' }}>LOAN</span>
                  </div>
                )}
              </div>
              <div className="nft-card-info" style={isUltraRare(nft) ? { color: '#111' } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p className="nft-card-name" style={{ ...(isUltraRare(nft) ? { color: '#111', fontWeight: 700 } : {}), flex: 1, minWidth: 0 }}>{nft.name}</p>
                  {isUltraRare(nft) && (
                    <span style={{ color: '#b8860b', fontSize: 'var(--nft-card-meta-size, 0.6rem)', fontWeight: 700, flexShrink: 0, marginLeft: '0.25rem' }}>UR</span>
                  )}
                </div>
                <p className="nft-card-collection" style={isUltraRare(nft) ? { color: '#555' } : {}}>{nft.collection}</p>
                {nft.rarity ? (() => {
                  const rs = getRarityStyle(nft.rarity)
                  return <p className="nft-card-rarity" style={{ color: isUltraRare(nft) ? rs.color : rs.color }}>{nft.rarity}</p>
                })() : null}
                {nft.mintNumber && nft.maxSupply && nft.maxSupply !== '0' && (
                  <p className="nft-card-mint">Mint #{nft.mintNumber} / {nft.maxSupply}</p>
                )}
                {(nft.chain || nft.floorPrice != null || nft.shine) && (
                  <div className="nft-card-footer">
                    {nft.chain ? <span className="nft-card-chain">{nft.chain}</span> : <span />}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {nft.floorPrice != null && (
                        <span className="nft-card-floor">Floor: {nft.floorPrice.toFixed(3)} {nft.floorPriceSymbol || 'ETH'}</span>
                      )}
                      <ShineBadge shine={nft.shine} />
                    </span>
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
          {contextNft && isComic(contextNft) && (
            <button
              className="nft-context-item"
              style={{ fontWeight: 600 }}
              onClick={() => { setReaderNft(contextNft); setReaderWebtoon(false); setContextMenu(null); setConfirmDelete(false) }}
            >
              &#128214; Read Comic
            </button>
          )}
          {(() => {
            // "Read Webtoon": shown when the NFT's contract has a webtoon
            // with at least one strip. Admins see it as soon as the
            // webtoon row exists, so they can keep editing an empty one.
            const w = contextNft?.contractAddress
              ? webtoonContracts[contextNft.contractAddress.toLowerCase()]
              : undefined
            if (!w || (!w.strips && !isSuperadmin)) return null
            return (
              <button
                className="nft-context-item"
                style={{ fontWeight: 600 }}
                onClick={() => { setReaderNft(contextNft); setReaderWebtoon(true); setContextMenu(null); setConfirmDelete(false) }}
              >
                &#128214; Read Webtoon
              </button>
            )
          })()}
          {/* Loan actions for the focused NFT. Borrower's perspective:
              Return to owner. Owner's perspective on a lent-out mint:
              Revoke loan. Both open a confirmation modal. */}
          {contextNft?.loanState?.kind === 'borrowed' && (
            <button
              className="nft-context-item"
              style={{ fontWeight: 600, color: '#2ea043' }}
              onClick={() => {
                if (!contextNft?.loanState || contextNft.loanState.kind !== 'borrowed') return
                setLoanConfirm({ kind: 'return', loanId: contextNft.loanState.loanId, nftName: contextNft.name, counterpartyLabel: contextNft.loanState.fromLabel })
                setContextMenu(null)
              }}
            >
              ↩ Return to Owner
            </button>
          )}
          {contextNft?.loanState?.kind === 'lent' && (
            <button
              className="nft-context-item"
              style={{ fontWeight: 600, color: '#ff8800' }}
              onClick={() => {
                if (!contextNft?.loanState || contextNft.loanState.kind !== 'lent') return
                setLoanConfirm({ kind: 'revoke', loanId: contextNft.loanState.loanId, nftName: contextNft.name, counterpartyLabel: contextNft.loanState.toLabel })
                setContextMenu(null)
              }}
            >
              ✕ Revoke Loan
            </button>
          )}
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
              <button className="nft-context-item" onClick={async () => {
                const nft = nfts.find(n => selected.has(n.id))
                if (!nft?.imageUrl) return
                try {
                  const res = await fetch('/api/nft-thumbs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'refresh', nft: { id: nft.id, imageUrl: nft.imageUrl, chain: nft.chain || '' } }),
                  })
                  const data = await res.json()
                  if (data.thumbUrl) {
                    setRefreshedThumbs(prev => ({ ...prev, [nft.id]: data.thumbUrl }))
                  }
                } catch { /* ignore */ }
                setSelected(new Set())
                setContextMenu(null)
              }}>
                &#x21BB; Refresh Image
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
              {selectedNft.videoUrl && isVideoUrl(selectedNft.videoUrl) ? (
                <video src={selectedNft.videoUrl} poster={selectedNft.thumbUrl || selectedNft.imageUrl || undefined} autoPlay loop muted playsInline controls />
              ) : (selectedNft.thumbUrl || selectedNft.imageUrl) ? (
                <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: 'var(--nft-lightbox-media-h, 450px)' }}>
                  <img src={selectedNft.thumbUrl || selectedNft.imageUrl!} alt={selectedNft.name} crossOrigin="anonymous" style={{ maxWidth: '100%', maxHeight: 'var(--nft-lightbox-media-h, 450px)', objectFit: 'contain', display: 'block' }} onError={handleImgError(selectedNft.thumbUrl ? selectedNft.imageUrl : null)} />
                  <button
                    onClick={() => { setFullscreen(true); setFsZoom(1); setFsPan({ x: 0, y: 0 }) }}
                    style={{
                      position: 'absolute', bottom: '-28px', right: '0px',
                      background: 'rgba(106,36,250,0.2)', border: '1px solid rgba(106,36,250,0.3)',
                      color: '#bab1a8', borderRadius: '4px', padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem', cursor: 'pointer',
                    }}
                  >
                    [+]
                  </button>
                </span>
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
                {selectedNft.rarity && (() => {
                  const rs = getRarityStyle(selectedNft.rarity!)
                  return (
                  <div className="nft-detail-cell" style={rs.glow ? { boxShadow: `inset ${rs.glow}` } : {}}>
                    <p className="nft-detail-label">Rarity</p>
                    <p className="nft-detail-value" style={{ textTransform: 'capitalize', color: rs.color, fontWeight: 600, ...(rs.glow ? { textShadow: rs.glow } : {}) }}>{selectedNft.rarity}</p>
                  </div>
                  )
                })()}
                {selectedNft.mintNumber && (
                  <div className="nft-detail-cell" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
                      <div>
                        <p className="nft-detail-label">Mint</p>
                        <p className="nft-detail-value">
                          #{selectedNft.mintNumber}{selectedNft.maxSupply && selectedNft.maxSupply !== '0' ? ` / ${selectedNft.maxSupply}` : ''}
                        </p>
                      </div>
                      {/* READ + LOAN (or RETURN) actions for comics. */}
                      {selectedNft && isComic(selectedNft) && (
                        <div style={{ display: 'flex', gap: '.4rem' }}>
                          <button
                            type="button"
                            onClick={() => { setReaderNft(selectedNft); setReaderWebtoon(false); setSelectedNft(null) }}
                            style={{ padding: '.4rem .85rem', fontSize: '.8rem', fontWeight: 700, background: 'var(--lw-purple, #6a24fa)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}
                          >READ</button>
                          {selectedNft.loanState?.kind === 'borrowed' ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectedNft.loanState || selectedNft.loanState.kind !== 'borrowed') return
                                setLoanConfirm({ kind: 'return', loanId: selectedNft.loanState.loanId, nftName: selectedNft.name, counterpartyLabel: selectedNft.loanState.fromLabel })
                                setSelectedNft(null)
                              }}
                              style={{ padding: '.4rem .85rem', fontSize: '.8rem', fontWeight: 700, background: '#2ea043', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}
                            >RETURN</button>
                          ) : selectedNft.loanState?.kind === 'lent' && selectedNft.loanState.status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectedNft.loanState || selectedNft.loanState.kind !== 'lent') return
                                setLoanConfirm({ kind: 'revoke', loanId: selectedNft.loanState.loanId, nftName: selectedNft.name, counterpartyLabel: selectedNft.loanState.toLabel })
                                setSelectedNft(null)
                              }}
                              style={{ padding: '.4rem .85rem', fontSize: '.8rem', fontWeight: 700, background: '#b3324a', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}
                            >REVOKE</button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setReaderNft(selectedNft); setReaderWebtoon(false); setReaderInitialAction('loan'); setSelectedNft(null) }}
                              style={{ padding: '.4rem .85rem', fontSize: '.8rem', fontWeight: 700, background: '#2ea043', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}
                            >LOAN</button>
                          )}
                        </div>
                      )}
                    </div>
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

      {/* Fullscreen Image Viewer */}
      {fullscreen && (selectedNft?.thumbUrl || selectedNft?.imageUrl) && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'radial-gradient(ellipse at 30% 20%, rgba(15, 10, 40, 0.97), rgba(5, 3, 20, 0.98) 60%, rgba(2, 1, 10, 0.99))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', cursor: fsDragging ? 'grabbing' : 'grab',
          }}
          onClick={(e) => {
            // Only close if it was a click (not a drag)
            if (e.target === e.currentTarget) {
              const dist = Math.abs(e.clientX - fsDragStart.current.x) + Math.abs(e.clientY - fsDragStart.current.y)
              if (dist < 5) { setFullscreen(false); setFsZoom(1); setFsPan({ x: 0, y: 0 }) }
            }
          }}
          onMouseDown={(e) => {
            setFsDragging(true)
            fsDragStart.current = { x: e.clientX, y: e.clientY, panX: fsPan.x, panY: fsPan.y }
          }}
          onMouseMove={(e) => {
            if (!fsDragging) return
            setFsPan({
              x: fsDragStart.current.panX + (e.clientX - fsDragStart.current.x),
              y: fsDragStart.current.panY + (e.clientY - fsDragStart.current.y),
            })
          }}
          onMouseUp={() => setFsDragging(false)}
          onMouseLeave={() => setFsDragging(false)}
          onWheel={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setFsZoom(z => {
              const delta = e.deltaY < 0 ? 0.03 : -0.03
              return Math.round(Math.min(Math.max(z + delta, 0.5), 5) * 100) / 100
            })
          }}
        >
          {/* Twinkling stars */}
          <style>{`
            @keyframes fs-twinkle {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 0.9; }
            }
          `}</style>
          {Array.from({ length: 80 }, (_, i) => (
            <div key={`fs-star-${i}`} style={{
              position: 'absolute',
              left: `${Math.sin(i * 137.508) * 50 + 50}%`,
              top: `${Math.cos(i * 73.137) * 50 + 50}%`,
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              borderRadius: '50%',
              backgroundColor: i % 7 === 0 ? '#aaccff' : i % 11 === 0 ? '#ffddaa' : '#ffffff',
              animation: `fs-twinkle ${2 + (i % 4) * 1.5}s ease-in-out ${(i * 0.37) % 5}s infinite`,
              pointerEvents: 'none',
            }} />
          ))}

          {/* Image */}
          <img
            src={selectedNft.thumbUrl || selectedNft.imageUrl || ''}
            alt={selectedNft.name}
            crossOrigin="anonymous"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              transform: `scale(${fsZoom}) translate(${fsPan.x / fsZoom}px, ${fsPan.y / fsZoom}px)`,
              transformOrigin: 'center center',
              transition: fsDragging ? 'none' : 'transform 0.15s ease-out',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
            onError={handleImgError(selectedNft.thumbUrl ? selectedNft.imageUrl : null)}
          />

          {/* Controls */}
          <div style={{
            position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: '0.5rem', alignItems: 'center',
            background: 'rgba(0,0,0,0.6)', borderRadius: '8px', padding: '0.4rem 0.75rem',
          }}>
            <button onClick={(e) => { e.stopPropagation(); setFsZoom(z => Math.max(z - 0.1, 0.5)) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.4rem' }}>−</button>
            <span style={{ color: '#bab1a8', fontSize: '0.8rem', minWidth: '3rem', textAlign: 'center' }}>{Math.round(fsZoom * 100)}%</span>
            <button onClick={(e) => { e.stopPropagation(); setFsZoom(z => Math.min(z + 0.1, 5)) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.4rem' }}>+</button>
            <span style={{ color: '#555', margin: '0 0.25rem' }}>|</span>
            <button onClick={(e) => { e.stopPropagation(); setFullscreen(false); setFsZoom(1); setFsPan({ x: 0, y: 0 }) }}
              style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '0.75rem', cursor: 'pointer' }}>ESC to close</button>
          </div>

          {/* Close button */}
          <button
            onClick={() => { setFullscreen(false); setFsZoom(1); setFsPan({ x: 0, y: 0 }) }}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
              width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem',
            }}
          >&#x2715;</button>
        </div>,
        document.body
      )}

      {/* Comic Reader — dispatches to paged or webtoon reader by format.
          A webtoon opens even with no animationUrl (it's keyed to the
          contract, not an IPFS bundle). */}
      {readerNft && (readerNft.animationUrl || readerWebtoon || readerNft.contractAddress) && (
        <ComicReaderDispatch
          name={readerNft.name}
          url={readerNft.animationUrl || ''}
          coverUrl={readerNft.imageUrl}
          contractAddress={readerNft.contractAddress}
          tokenId={readerNft.tokenId}
          viewerTier={readerNft.rarity}
          isAdmin={isSuperadmin}
          loanState={readerNft.loanState || null}
          forceFormat={readerWebtoon ? 'webtoon' : undefined}
          initialAction={readerInitialAction}
          onClose={() => { setReaderNft(null); setReaderWebtoon(false); setReaderInitialAction(null) }}
          onLoansChanged={onLoansChanged}
        />
      )}

      {/* Loan confirmation modal — Return to Owner / Revoke Loan. */}
      {loanConfirm && typeof document !== 'undefined' && createPortal(
        <div onClick={() => !loanBusy && setLoanConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a2e', border: '1px solid rgba(106,36,250,.4)', borderRadius: 12, padding: '1.25rem', minWidth: 'min(440px, 92vw)', maxWidth: '92vw', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }}>
            <h3 style={{ color: '#fff', margin: '0 0 .6rem', fontSize: '1rem', fontWeight: 700 }}>
              {loanConfirm.kind === 'return' ? 'Return to owner' : 'Revoke loan'}
            </h3>
            <p style={{ color: '#e4dad1', margin: '0 0 1rem', fontSize: '.9rem', lineHeight: 1.45 }}>
              {loanConfirm.kind === 'return'
                ? <>Return <strong>{loanConfirm.nftName}</strong> to {loanConfirm.counterpartyLabel}? You will lose access immediately.</>
                : <>Cancel the loan of <strong>{loanConfirm.nftName}</strong> to {loanConfirm.counterpartyLabel}? They will lose access immediately and you can read it again.</>}
            </p>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button type="button" disabled={loanBusy} onClick={() => setLoanConfirm(null)}
                style={{ padding: '.5rem 1rem', fontSize: '.85rem', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 4, color: '#bab1a8', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" disabled={loanBusy} onClick={runLoanAction}
                style={{ padding: '.5rem 1rem', fontSize: '.85rem', fontWeight: 700, background: loanConfirm.kind === 'return' ? '#2ea043' : '#b3324a', border: 'none', borderRadius: 4, color: '#fff', cursor: loanBusy ? 'wait' : 'pointer' }}>
                {loanBusy ? '…' : (loanConfirm.kind === 'return' ? 'Return' : 'Revoke')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
