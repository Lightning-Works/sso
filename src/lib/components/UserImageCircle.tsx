'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
const MAX_FILE_SIZE = 5 * 1024 * 1024

interface UserImageCircleProps {
  diameter?: number
  initialImageUrl?: string | null
  initialOuterColor?: string
  initialInnerColor?: string
  onSave?: (data: { file: File | null; dataUrl: string | null; outerColor: string; innerColor: string; panX: number; panY: number; zoom: number }) => void
}

export function UserImageCircle({
  diameter = 180,
  initialImageUrl = null,
  initialOuterColor = '#000000',
  initialInnerColor = '#000000',
  onSave,
}: UserImageCircleProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(initialImageUrl)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [outerColor, setOuterColor] = useState(initialOuterColor)
  const [innerColor, setInnerColor] = useState(initialInnerColor)
  const [panX, setPanX] = useState(0.5)
  const [panY, setPanY] = useState(0.5)
  const [zoom, setZoom] = useState(1.0)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0.5, panY: 0.5 })

  // Update if initial URL changes
  useEffect(() => {
    if (initialImageUrl && !imageFile) setImageDataUrl(initialImageUrl)
  }, [initialImageUrl])

  const handleFile = useCallback((file: File) => {
    setError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Accepted: JPEG, PNG, WebP, GIF, MP4')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File must be under 5 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImageFile(file)
      setImageDataUrl(reader.result as string)
      setPanX(0.5)
      setPanY(0.5)
      setZoom(1.0)
      setDirty(true)
    }
    reader.readAsDataURL(file)
  }, [])

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imageDataUrl) return
    e.preventDefault()
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY }
  }, [imageDataUrl, panX, panY])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const sensitivity = 1.5 / (diameter * zoom)
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPanX(Math.max(0, Math.min(1, dragStart.current.panX - dx * sensitivity)))
      setPanY(Math.max(0, Math.min(1, dragStart.current.panY - dy * sensitivity)))
      setDirty(true)
    }
    const handleMouseUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [diameter, zoom])

  // Scroll to zoom
  useEffect(() => {
    const el = circleRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (!imageDataUrl) return
      e.preventDefault()
      setZoom(prev => {
        const next = Math.max(0.5, Math.min(4, prev + (e.deltaY > 0 ? -0.08 : 0.08)))
        setDirty(true)
        return next
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [imageDataUrl])

  const handleSave = () => {
    onSave?.({ file: imageFile, dataUrl: imageDataUrl, outerColor, innerColor, panX, panY, zoom })
    setDirty(false)
  }

  // Ring dimensions
  const ringThickness = Math.max(3, Math.round(diameter * 0.03))
  const gapThickness = Math.max(1, Math.round(diameter * 0.01))
  const totalInset = ringThickness + gapThickness + ringThickness
  const imageSize = diameter - totalInset * 2
  const imgTransform = `scale(${zoom}) translate(${(panX - 0.5) * -100}%, ${(panY - 0.5) * -100}%)`

  // Color picker rectangle style
  const pickerStyle = (isLeft: boolean): React.CSSProperties => ({
    position: 'absolute',
    bottom: isLeft ? '8px' : '8px',
    [isLeft ? 'left' : 'right']: '8px',
    width: '36px',
    height: '24px',
    borderRadius: '3px',
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {/* Circle with rings */}
      <div style={{ position: 'relative', width: diameter, height: diameter }}>
        <div
          ref={circleRef}
          onMouseDown={handleMouseDown}
          onClick={() => { if (!imageDataUrl) fileInputRef.current?.click() }}
          style={{
            width: diameter,
            height: diameter,
            borderRadius: '50%',
            position: 'relative',
            cursor: imageDataUrl ? 'grab' : 'pointer',
            userSelect: 'none',
          }}
        >
          {/* Outer ring */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: outerColor }} />
          {/* Gap */}
          <div style={{ position: 'absolute', top: ringThickness, left: ringThickness, right: ringThickness, bottom: ringThickness, borderRadius: '50%', backgroundColor: '#000' }} />
          {/* Inner ring */}
          <div style={{ position: 'absolute', top: ringThickness + gapThickness, left: ringThickness + gapThickness, right: ringThickness + gapThickness, bottom: ringThickness + gapThickness, borderRadius: '50%', backgroundColor: innerColor }} />
          {/* Image */}
          <div style={{
            position: 'absolute', top: totalInset, left: totalInset,
            width: imageSize, height: imageSize, borderRadius: '50%',
            overflow: 'hidden', backgroundColor: 'var(--lw-wallet-row-bg, #1a1a1c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="User" draggable={false} style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transform: imgTransform, transformOrigin: 'center center', pointerEvents: 'none',
              }} />
            ) : (
              <span style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.7rem', textAlign: 'center', padding: '8px' }}>
                Click to upload
              </span>
            )}
          </div>
        </div>

        {/* Outer color picker — bottom left */}
        <div style={pickerStyle(true)}>
          <label style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}>
            <div style={{ width: '100%', height: '100%', backgroundColor: outerColor, border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px' }} />
            <input type="color" value={outerColor} onChange={e => { setOuterColor(e.target.value); setDirty(true) }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
          </label>
          <span style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.5rem', marginTop: '1px' }}>outer</span>
        </div>

        {/* Inner color picker — bottom right */}
        <div style={pickerStyle(false)}>
          <label style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}>
            <div style={{ width: '100%', height: '100%', backgroundColor: innerColor, border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px' }} />
            <input type="color" value={innerColor} onChange={e => { setInnerColor(e.target.value); setDirty(true) }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
          </label>
          <span style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.5rem', marginTop: '1px' }}>inner</span>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} style={{ display: 'none' }} />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={() => fileInputRef.current?.click()}
          className="lw-btn lw-btn-connect" style={{ width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}>
          {imageDataUrl ? 'Replace' : 'Upload'}
        </button>
        {dirty && onSave && (
          <button onClick={handleSave}
            className="lw-btn lw-btn-primary" style={{ width: 'auto', padding: '0.2rem 0.75rem', fontSize: '0.75rem' }}>
            Save
          </button>
        )}
      </div>

      {/* Error */}
      {error && <span style={{ color: 'var(--lw-error, #ff4444)', fontSize: '0.7rem' }}>{error}</span>}

      {/* Instructions */}
      <span style={{ color: 'var(--lw-text-muted, #7a7572)', fontSize: '0.6rem', textAlign: 'center' }}>
        Max 5MB · JPEG, PNG, WebP, GIF, MP4
        {imageDataUrl && <><br />Scroll to zoom · Drag to pan</>}
      </span>
    </div>
  )
}
