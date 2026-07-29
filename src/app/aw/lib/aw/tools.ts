/**
 * Mining tool data + scoring.
 *
 * Tool stats live in the AtomicAssets template immutable_data of schema
 * tool.worlds (verified on-chain): delay (cooldown seconds), ease (reduces
 * proof-of-work), luck (NFT drop rate), difficulty, shine, rarity.
 *
 * Advisory model (defensible from the stats; TLM-per-mine itself is set by the
 * land + planet pool, so tool choice controls FREQUENCY and NFT luck):
 *   - A bag's cooldown ≈ the sum of its 3 tools' `delay`.
 *   - mines/hour ≈ 3600 / total delay  →  more mines = more TLM over time.
 *   - NFT drops/hour ∝ total luck × mines/hour.
 * So: best-for-TLM = lowest total delay; best-for-NFTs = highest luck-per-delay.
 */

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
  const minesPerHr = delay > 0 ? 3600 / delay : 0
  return { tools, delay, luck, ease, minesPerHr, nftPerHr: Math.round(luck * minesPerHr) }
}

/** Lowest combined delay → mines most often → most TLM over time. */
export function bestForTlm(tools: Tool[]): Loadout {
  return combine([...tools].sort((a, b) => a.delay - b.delay).slice(0, 3))
}

/** Highest luck-per-delay → most NFT drops over time. */
export function bestForNft(tools: Tool[]): Loadout {
  return combine([...tools].sort((a, b) => (b.luck / (b.delay || 1)) - (a.luck / (a.delay || 1))).slice(0, 3))
}
