/**
 * Tier detection from NFT attributes.
 *
 * Real-world contracts label the tier attribute inconsistently — "Tier",
 * "Tier#", "Tier Number", "Tier No.", "Rarity", "Rarity Tier", and so on
 * are all in use. We accept any trait whose normalized name STARTS WITH
 * "tier" or "rarity", plus the simple aliases "rank" and "level". The
 * first such attribute on the NFT decides the tier name (so contracts
 * with multiple labels get a deterministic winner: the one defined
 * first).
 *
 * Used by both /api/comics/tiers (server) and wallet UIs (client) so
 * the viewer's tier and the inventory are always derived the same way.
 */
export interface TierAttribute { trait_type?: string; value?: unknown }

const TIER_PREFIXES = ['tier', 'rarity']
const TIER_ALIASES = new Set(['rank', 'level'])

export function isTierTrait(trait_type: string | undefined | null): boolean {
  if (!trait_type) return false
  const k = String(trait_type).toLowerCase().trim()
  if (!k) return false
  if (TIER_ALIASES.has(k)) return true
  for (const p of TIER_PREFIXES) {
    // startsWith covers "tier", "tier#", "tier number", "tier no.",
    // "rarity", "rarity tier" etc. — anything that begins with the
    // canonical word is treated as a tier label.
    if (k === p) return true
    if (k.startsWith(p) && !/^[a-z0-9]/.test(k.charAt(p.length))) return true
  }
  return false
}

export function extractTier(attrs: TierAttribute[] | null | undefined): string | null {
  if (!Array.isArray(attrs)) return null
  for (const a of attrs) {
    if (!isTierTrait(a.trait_type)) continue
    const v = a.value
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}
