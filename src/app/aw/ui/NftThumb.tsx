'use client'

/**
 * Card-shaped NFT thumbnail tile (SSO-inventory look). Thin wrapper over AwMedia:
 * shows the static thumbnail, fades in the animated original when available, and
 * (with cacheKey) caches it to IndexedDB. Falls back to a neutral placeholder,
 * never a broken-image icon.
 */
import { AwMedia } from '@/components/AwMedia'

export function NftThumb({ src, animatedSrc, cacheKey, alt = '', border, placeholder = 'No image', radius = 8 }: {
  src: string | null | undefined
  animatedSrc?: string | null
  cacheKey?: string
  alt?: string
  border?: string
  placeholder?: string
  radius?: number
}) {
  return (
    <AwMedia
      staticSrc={src}
      animatedSrc={animatedSrc}
      cacheKey={cacheKey}
      alt={alt}
      fit="contain"
      fill
      radius={radius}
      border={border}
      placeholder={placeholder}
      style={{ aspectRatio: '1' }}
    />
  )
}
