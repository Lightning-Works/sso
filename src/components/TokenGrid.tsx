'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatUsd, getTokenLogoUrl } from '@/lib/wallets/balances/prices'

function formatTokenAmount(balance: string): string {
  const num = parseFloat(balance)
  if (isNaN(num) || num === 0) return '0'

  const intDigits = Math.floor(Math.abs(num)).toString().length

  if (num < 1) {
    // For very small numbers, show up to 6 significant digits
    const s = num.toFixed(10)
    const match = s.match(/^0\.(0*)([1-9]\d*)/)
    if (match) {
      const leadingZeros = match[1].length
      const sigDigits = Math.min(match[2].length, 4)
      return parseFloat(num.toFixed(leadingZeros + sigDigits)).toString()
    }
    return parseFloat(num.toFixed(6)).toString()
  }

  const decimals = Math.max(0, 6 - intDigits)
  return parseFloat(num.toFixed(decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}
import type { WalletToken } from '@/lib/wallets/types'

interface TokenGridProps {
  tokens: WalletToken[]
  prices: Record<string, number>
  /** Symbol of the chain's native token (e.g. 'ETH', 'SOL', 'WAX') */
  nativeSymbol: string
  /** Optional display suffix for native token (e.g. ' - Trilium') */
  labelOverrides?: Record<string, string>
  storageKey?: string
}

function loadSpam(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveSpam(key: string, spam: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...spam]))
}

export function TokenGrid({
  tokens,
  prices,
  nativeSymbol,
  labelOverrides = {},
  storageKey = 'token-spam',
}: TokenGridProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [spam, setSpam] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'all' | 'spam'>('all')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const lastClickedIndex = useRef<number>(-1)

  useEffect(() => { setSpam(loadSpam(storageKey)) }, [storageKey])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const markSpam = useCallback(() => {
    const next = new Set(spam)
    selected.forEach(id => next.add(id))
    setSpam(next)
    saveSpam(storageKey, next)
    setSelected(new Set())
    setContextMenu(null)
  }, [spam, selected, storageKey])

  const unmarkSpam = useCallback(() => {
    const next = new Set(spam)
    selected.forEach(id => next.delete(id))
    setSpam(next)
    saveSpam(storageKey, next)
    setSelected(new Set())
    setContextMenu(null)
  }, [spam, selected, storageKey])

  // Sort: native first, then by USD value desc, then no-value tokens
  const sortedTokens = [...tokens].sort((a, b) => {
    const aNative = a.symbol === nativeSymbol ? 0 : 1
    const bNative = b.symbol === nativeSymbol ? 0 : 1
    if (aNative !== bNative) return aNative - bNative

    const aUsd = prices[a.symbol] ? parseFloat(a.balance) * prices[a.symbol] : -1
    const bUsd = prices[b.symbol] ? parseFloat(b.balance) * prices[b.symbol] : -1
    return bUsd - aUsd
  })

  const visible = sortedTokens.filter(t => {
    const key = `${t.symbol}-${t.walletAddress}`
    if (viewMode === 'spam') return spam.has(key)
    return !spam.has(key)
  })

  const spamCount = sortedTokens.filter(t => spam.has(`${t.symbol}-${t.walletAddress}`)).length

  const handleClick = (t: WalletToken, index: number, e: React.MouseEvent) => {
    const key = `${t.symbol}-${t.walletAddress}`
    if (e.shiftKey && lastClickedIndex.current >= 0) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const next = new Set(selected)
      for (let i = start; i <= end; i++) {
        next.add(`${visible[i].symbol}-${visible[i].walletAddress}`)
      }
      setSelected(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      next.has(key) ? next.delete(key) : next.add(key)
      setSelected(next)
    } else if (selected.size > 0) {
      setSelected(new Set())
    }
    lastClickedIndex.current = index
  }

  const handleContextMenu = (e: React.MouseEvent, t: WalletToken) => {
    e.preventDefault()
    const key = `${t.symbol}-${t.walletAddress}`
    if (!selected.has(key)) setSelected(new Set([key]))
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <style>{`
        .token-grid-wrap {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .token-card {
          background: var(--lw-wallet-row-bg, #1a1a1c);
          border-radius: var(--lw-radius-sm, 4px);
          padding: 0.75rem 1.25rem;
          min-width: 120px;
          text-align: center;
          user-select: none;
          cursor: default;
          transition: outline 0.1s;
          outline: 2px solid transparent;
        }
        .token-card--selected {
          outline: 2px solid var(--lw-purple, #6a24fa);
        }
        .token-card--native {
          border: 1px solid rgba(106, 36, 250, 0.5);
        }
        .token-card--valued {
          background: rgba(30, 28, 40, 1);
        }
        .token-ticker-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .token-logo {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          object-fit: contain;
          flex-shrink: 0;
        }
        .token-logo--native {
          width: 22px;
          height: 22px;
        }
        .token-ticker {
          color: var(--nft-accent, #ff8800);
          margin: 0;
          font-weight: 600;
          letter-spacing: 0.05em;
        }
        .token-ticker--native { font-size: 0.875rem; }
        .token-ticker--valued { font-size: 0.8125rem; }
        .token-ticker--default { font-size: 0.75rem; }
        .token-balance {
          color: var(--lw-text-white, #fff);
          font-weight: 600;
          font-size: 1.1rem;
          margin: 0.2rem 0 0 0;
        }
        .token-usd {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.7rem;
          margin: 0.15rem 0 0 0;
        }
        .token-name {
          color: var(--lw-text-muted, #7a7572);
          font-size: 0.6rem;
          margin: 0.1rem 0 0 0;
        }
        .token-view-tabs {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .token-view-tab {
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          border: none;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
        }
        .token-context-menu {
          position: fixed;
          z-index: 10000;
          background: #1a1a2e;
          border: 1px solid rgba(106, 36, 250, 0.3);
          border-radius: 8px;
          padding: 4px 0;
          min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .token-context-item {
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
        .token-context-item:hover {
          background: rgba(106, 36, 250, 0.2);
        }
      `}</style>

      {/* Tabs */}
      {tokens.length > 0 && (spamCount > 0 || selected.size > 0) && (
        <div className="token-view-tabs">
          {selected.size > 0 && (
            <span style={{ color: 'var(--lw-text-muted)', fontSize: '0.7rem', alignSelf: 'center', marginRight: 'auto' }}>
              {selected.size} selected — right-click for options
            </span>
          )}
          <button
            className="token-view-tab"
            onClick={() => { setViewMode('all'); setSelected(new Set()) }}
            style={{
              backgroundColor: viewMode === 'all' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.12)',
              color: viewMode === 'all' ? '#fff' : '#bab1a8',
            }}
          >Tokens</button>
          <button
            className="token-view-tab"
            onClick={() => { setViewMode('spam'); setSelected(new Set()) }}
            style={{
              backgroundColor: viewMode === 'spam' ? 'var(--lw-purple, #6a24fa)' : 'rgba(255,255,255,0.12)',
              color: viewMode === 'spam' ? '#fff' : '#bab1a8',
            }}
          >Spam {spamCount > 0 && `(${spamCount})`}</button>
        </div>
      )}

      {visible.length === 0 ? (
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>
          {viewMode === 'spam' ? 'No spam tokens' : 'No tokens found'}
        </p>
      ) : (
        <div className="token-grid-wrap">
          {visible.map((t, i) => {
            const key = `${t.symbol}-${t.walletAddress}`
            const isNative = t.symbol === nativeSymbol
            const usdValue = prices[t.symbol] ? parseFloat(t.balance) * prices[t.symbol] : null
            const hasValue = usdValue != null && usdValue > 0.01
            const label = labelOverrides[t.symbol]

            return (
              <div
                key={`${key}-${i}`}
                className={`token-card${selected.has(key) ? ' token-card--selected' : ''}${isNative ? ' token-card--native' : hasValue ? ' token-card--valued' : ''}`}
                onClick={(e) => handleClick(t, i, e)}
                onContextMenu={(e) => handleContextMenu(e, t)}
              >
                <div className="token-ticker-row">
                  {(() => {
                    const logoUrl = t.logoUrl || getTokenLogoUrl(t.symbol)
                    return logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={t.symbol}
                        className={`token-logo${isNative ? ' token-logo--native' : ''}`}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : null
                  })()}
                  <span className={`token-ticker ${isNative ? 'token-ticker--native' : hasValue ? 'token-ticker--valued' : 'token-ticker--default'}`}>
                    ${t.symbol}{label || ''}
                  </span>
                </div>
                <p className="token-balance">
                  {formatTokenAmount(t.balance)}
                </p>
                {hasValue && (
                  <p className="token-usd">({formatUsd(usdValue!)} USD)</p>
                )}
                {t.name && t.name !== t.symbol && !label && (
                  <p className="token-name">{t.name}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div className="token-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          {viewMode === 'spam' ? (
            <button className="token-context-item" onClick={unmarkSpam}>
              &#x2716; Remove from Spam
            </button>
          ) : (
            <button className="token-context-item" onClick={markSpam}>
              &#x26A0; Mark as Spam
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
