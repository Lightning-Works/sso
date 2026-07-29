/**
 * Alien Worlds Wallet (AWW) — framework preview.
 *
 * Modular fork preview. All UI is driven by design tokens (see theme/tokens.ts)
 * with a live Styling panel + skins; each feature lives in its own module under
 * features/. Read sections pull live WAX data via the existing SSO endpoints;
 * action sections are labeled phase-stubs. Additive route only — deployed as a
 * Vercel preview so production login is never affected.
 */
import AwwApp from './AwwApp'

export default function Page() {
  return <AwwApp />
}
