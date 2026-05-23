'use client'

/**
 * ComicReaderDispatch — picks the right reader for a comic.
 *
 * A comic is either paged (book-style spreads → ComicReader) or a
 * webtoon (vertical scroll → WebtoonReader). When `forceFormat` is
 * given (e.g. the wallet's "Read Webtoon" action), we mount that reader
 * straight away. Otherwise we do one fast /api/comic-pages probe to
 * read the comic's stored format, then mount the right reader —
 * avoiding ComicReader's IPFS gateway probes for a webtoon.
 *
 * onSwitchFormat lets a reader hand off at runtime — e.g. when an admin
 * toggles the format, or as a safety net if the probe disagreed.
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ComicReader, parseCid } from './ComicReader'
import { WebtoonReader } from './WebtoonReader'
import type { NftLoanState } from './NftGrid'

interface Props {
  name: string
  url: string
  onClose: () => void
  isAdmin?: boolean
  coverUrl?: string | null
  contractAddress?: string | null
  /** On-chain token id — required for loan creation/return from the reader. */
  tokenId?: string | null
  viewerTier?: string | null
  /** Active loan context for this specific mint, threaded through from
   *  the wallet so the reader knows whether to show LOAN or RETURN. */
  loanState?: NftLoanState | null
  /** Skip the format probe and mount this reader directly. */
  forceFormat?: 'pages' | 'webtoon'
  /** Called after the reader mutates a loan so the wallet can refresh. */
  onLoansChanged?: () => void
}

export function ComicReaderDispatch(props: Props) {
  const { forceFormat, loanState, ...readerProps } = props
  const { name, url, contractAddress, onClose } = props
  const [format, setFormat] = useState<'pages' | 'webtoon' | null>(forceFormat ?? null)

  useEffect(() => {
    if (forceFormat) return  // caller already knows the format
    const { cid } = parseCid(url, name, contractAddress || undefined)
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/comic-pages?cid=${encodeURIComponent(cid)}&name=${encodeURIComponent(name)}`)
        if (cancelled) return
        // On 4xx (no fallback / not signed in / not owner) fall through to
        // ComicReader, which renders the appropriate message + admin tools.
        const j = r.ok ? await r.json() : null
        setFormat(j?.format === 'webtoon' ? 'webtoon' : 'pages')
      } catch {
        if (!cancelled) setFormat('pages')
      }
    })()
    return () => { cancelled = true }
  }, [url, name, contractAddress, forceFormat])

  if (format === null) {
    return createPortal(
      <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: '#111111', borderRadius: 12, width: 'min(1200px,96vw)', height: '95vh', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px 5px rgba(80,40,200,.5),0 0 40px 15px rgba(60,30,160,.35),0 0 80px 30px rgba(40,20,120,.25),0 0 160px 60px rgba(20,10,60,.15)' }}>
          <p style={{ color: '#bab1a8', fontSize: '.9rem', margin: 0 }}>Checking comic data&hellip;</p>
        </div>
      </div>,
      document.body,
    )
  }

  return format === 'webtoon'
    ? <WebtoonReader {...readerProps} loanState={loanState} onSwitchFormat={setFormat} />
    : <ComicReader {...readerProps} loanState={loanState} onSwitchFormat={setFormat} />
}
