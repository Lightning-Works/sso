/**
 * Mining tool data + scoring.
 *
 * Tool stats live in the AtomicAssets template immutable_data of schema
 * tool.worlds (verified on-chain): delay (cooldown seconds), ease (reduces
 * proof-of-work), luck (NFT drop rate), difficulty, shine, rarity.
 *
 * Advisory model (verified on-chain 2026-07-29 from m.federation tables + a
 * real max-cadence miner):
 *   - A bag's cooldown ≈ 0.8 × the sum of its 3 tools' `delay` (empirical).
 *   - mines/hour ≈ 3600 / (0.8 × total delay).
 *   - TLM per mine scales with total LUCK against the planet pool, so
 *     TLM/hour ∝ total luck ÷ total delay.
 *   - NFT drops/hour ∝ total luck.
 * So: best-for-TLM = highest luck-per-delay ratio; best-for-NFTs = highest
 * absolute luck (accept longer delays). Mine high-emission planets (Neri/
 * Kavian/Veles) and own your land to skip the landowner commission.
 */
const COOLDOWN_MULT = 0.8

export type Tool = {
  assetId: string
  templateId: number
  name: string
  rarity: string
  shine: string
  delay: number
  ease: number
  luck: number
  difficulty: number
  img?: string
}

export type Loadout = { tools: Tool[]; delay: number; luck: number; ease: number; minesPerHr: number; nftPerHr: number }

export async function fetchTools(account: string): Promise<Tool[]> {
  const url = `https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${encodeURIComponent(account)}&collection_name=alien.worlds&schema_name=tool.worlds&page=1&limit=200`
  const r = await fetch(url)
  if (!r.ok) throw new Error('failed to load tools')
  const d = await r.json()
  return (d.data || []).map((a: Record<string, unknown>) => {
    const tpl = (a.template as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((a.data as Record<string, unknown>) || {}) }
    const num = (v: unknown) => Number(v) || 0
    return {
      assetId: String(a.asset_id || ''),
      templateId: num(tpl.template_id),
      name: String(im.name || 'Tool'),
      rarity: String(im.rarity || ''),
      shine: String(im.shine || ''),
      delay: num(im.delay),
      ease: num(im.ease),
      luck: num(im.luck),
      difficulty: num(im.difficulty),
      img: im.img ? String(im.img) : undefined,
    } as Tool
  })
}

export function combine(tools: Tool[]): Loadout {
  const delay = tools.reduce((s, t) => s + t.delay, 0)
  const luck = tools.reduce((s, t) => s + t.luck, 0)
  const ease = tools.reduce((s, t) => s + t.ease, 0)
  const cooldown = delay * COOLDOWN_MULT
  const minesPerHr = cooldown > 0 ? 3600 / cooldown : 0
  return { tools, delay, luck, ease, minesPerHr, nftPerHr: Math.round(luck * minesPerHr) }
}

/** Highest luck-per-delay → best TLM/hour (TLM/hr ∝ luck ÷ delay). */
export function bestForTlm(tools: Tool[]): Loadout {
  return combine([...tools].sort((a, b) => (b.luck / (b.delay || 1)) - (a.luck / (a.delay || 1))).slice(0, 3))
}

/** Highest absolute luck → most NFT drops (accepts longer delays). */
export function bestForNft(tools: Tool[]): Loadout {
  return combine([...tools].sort((a, b) => b.luck - a.luck).slice(0, 3))
}
