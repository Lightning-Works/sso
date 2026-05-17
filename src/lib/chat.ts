/**
 * Base URL of the Kinet.ink chat embed (a Lovable-hosted app).
 *
 * Kinet.ink renamed this host (fairytime.lovable.app -> kinetink.lovable.app),
 * which silently broke the chat for every app because the old URL was
 * hardcoded in several pages. It's centralised here and overridable via env
 * so the next rename is a config change, not a code deploy.
 */
export const CHAT_EMBED_BASE =
  process.env.NEXT_PUBLIC_KINET_EMBED_BASE || 'https://kinetink.lovable.app'
