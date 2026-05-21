'use client'

/**
 * ComicReaderDispatch — picks the right reader for a comic.
 *
 * A comic is either paged (book-style spreads → ComicReader) or a
 * webtoon (vertical scroll → WebtoonReader). The format lives on the
 * comic row, so this does one fast /api/comic-pages probe up front to
 * read it, then mounts the correct reader directly — avoiding mounting
 * ComicReader (and running its IPFS gateway probes) for a webtoon.
 *
 * onSwitchFormat lets a reader hand off at runtime — e.g. when an admin
 * toggles the format, or as a safety net if the probe disagreed.
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ComicReader, parseCid } from './ComicReader'
import { WebtoonReader } from './WebtoonReader'

interface Props {
  name: string
  url: string
  onClose: () => void
  isAdmin?: boolean
  coverUrl?: string | null
  contractAddress?: string | null
  viewerTier?: string | null
}

export function ComicReaderDispatch(props: Props) {
  const [format, setFormat] = useState<'pages' | 'webtoon' | null>(null)
  const { name, url, contractAddress, onClose } = props

  useEffect(() => {
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
  }, [url, name, contractAddress])

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
    ? <WebtoonReader {...props} onSwitchFormat={setFormat} />
    : <ComicReader {...props} onSwitchFormat={setFormat} />
}
