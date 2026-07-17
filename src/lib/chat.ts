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

/**
 * Exact origin of the chat embed, derived from CHAT_EMBED_BASE so it follows
 * the env override (and the next Kinet rename) automatically.
 *
 * Used for BOTH directions of the identity handshake:
 *  - inbound: only trust messages whose origin matches this exactly.
 *  - outbound: never post identity to a '*' target.
 *
 * A substring test (`origin.includes('lovable.app')`) is NOT safe — it also
 * matches attacker-controlled hosts such as https://evil-lovable.app.bad.com,
 * which would let any page that framed us harvest the user's identity.
 * Empty string if the base is unparseable, in which case the handshake is
 * disabled rather than falling open.
 */
export const CHAT_EMBED_ORIGIN: string = (() => {
  try {
    return new URL(CHAT_EMBED_BASE).origin
  } catch {
    return ''
  }
})()

/** True only for the exact chat-embed origin. Fails closed. */
export function isChatEmbedOrigin(origin: string): boolean {
  return CHAT_EMBED_ORIGIN !== '' && origin === CHAT_EMBED_ORIGIN
}
