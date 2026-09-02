'use client'

/**
 * Card-shaped NFT thumbnail tile (SSO-inventory look). Thin wrapper over AwMedia:
 * shows the (now animated) same-origin thumbnail, a "Loading Image" spinner while
 * it loads, and a neutral placeholder on failure.
 */
import { AwMedia } from '@/components/AwMedia'

export function NftThumb({ src, loading = false, alt = '', border, placeholder = 'No image', radius = 8 }: {
  src: string | null | undefined
  loading?: boolean
  alt?: string
  border?: string
  placeholder?: string
  radius?: number
}) {
  return (
    <AwMedia
      src={src}
      loading={loading}
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
