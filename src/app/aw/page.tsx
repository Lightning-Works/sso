/**
 * Alien Worlds Wallet (AWW) — framework preview.
 *
 * Modular fork preview. All UI is driven by design tokens (see theme/tokens.ts)
 * with a live Styling panel + skins; each feature lives in its own module under
 * features/. Read sections pull live WAX data via the existing SSO endpoints;
 * action sections are labeled phase-stubs. Additive route only — deployed as a
 * Vercel preview so production login is never affected.
 */
import type { Metadata } from 'next'
import AwwApp from './AwwApp'

export const metadata: Metadata = {
  title: 'Alien Worlds Wallet',
  description: 'All-in-one Alien Worlds wallet — Trilium, planet tokens, syndicates, teleporter and NFTs.',
}

export default function Page() {
  return <AwwApp />
}
