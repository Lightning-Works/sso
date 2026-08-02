/**
 * Alien Worlds Wallet (AWW) — framework preview.
 *
 * Optional catch-all so every feature has a human-readable URL
 * (/aw, /aw/syndicates/kavian, /aw/mining/tool-advisor, …). The page always
 * renders the same client shell (AwwApp); AwwApp reads the path to pick the
 * active feature and keeps the URL in sync via the History API, so switching
 * pages never reloads the session or wallet connection.
 */
import type { Metadata } from 'next'
import AwwApp from '../AwwApp'

export const metadata: Metadata = {
  title: 'Alien Worlds Wallet',
  description: 'All-in-one Alien Worlds wallet — Trilium, planet tokens, syndicates, teleporter and NFTs.',
}

export default function Page() {
  return <AwwApp />
}
