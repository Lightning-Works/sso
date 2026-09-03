/**
 * Skylie — the AWW assistant. The chat itself is the Kinet.ink embed iframe (same
 * as the SSO wallet's character chat), which renders the styled speech bubbles
 * (tail + the character's own colors) and circular avatar. We supply her full-body
 * transparent side image beside it.
 *
 * The CHAT key is designed to be embedded client-side (it rides in the iframe URL).
 * The ADMIN key (training/usage) is secret and must never appear in client code —
 * it belongs in a server-side env var when we wire knowledge ingestion.
 */
import { CHAT_EMBED_BASE } from '@/lib/chat'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

export const SKYLIE_CHAT_KEY = 'kinet_sHDSunxqq48ym0tVFiS61DotKZSfaitYWHL9xkAefWOJWG12'
export const SKYLIE_SIDE_IMG = `${STORAGE_BASE}/app_side_image/skylie_side_img_1800px.webp`

/** The Kinet.ink chat embed URL for Skylie (bubbles, avatar, colors all included). */
export function skylieEmbedUrl(opts: { userId?: string; userName?: string } = {}): string {
  const p = new URLSearchParams({ key: SKYLIE_CHAT_KEY, bg: '14141c', accent: 'b06cff', header: 'false' })
  if (opts.userId) p.set('user_id', opts.userId)
  if (opts.userName) p.set('userName', opts.userName)
  return `${CHAT_EMBED_BASE}/embed/chat?${p.toString()}`
}
