/**
 * Owned Alien Worlds land (schema land.worlds).
 *
 * Land stats live in the AtomicAssets template immutable_data (verified
 * on-chain): planet, rarity, and the mining bonuses a land grants to miners on
 * it — ease (lowers proof-of-work), luck (NFT drops), delay, difficulty.
 *
 * Why it matters for the mining advisor: mining on land you OWN skips the
 * landowner commission (you keep the full reward), and a land's ease/luck feed
 * into the miner's effective loadout. So we surface owned land alongside tools.
 */
export type Land = {
  assetId: string
  templateId: number
  name: string
  planet: string
  rarity: string
  ease: number
  luck: number
  delay: number
  difficulty: number
  img?: string
}

export async function fetchLands(account: string): Promise<Land[]> {
  const url = `https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${encodeURIComponent(account)}&collection_name=alien.worlds&schema_name=land.worlds&page=1&limit=200`
  const r = await fetch(url)
  if (!r.ok) throw new Error('failed to load land')
  const d = await r.json()
  return (d.data || []).map((a: Record<string, unknown>) => {
    const tpl = (a.template as Record<string, unknown>) || {}
    const im = { ...((tpl.immutable_data as Record<string, unknown>) || {}), ...((a.data as Record<string, unknown>) || {}) }
    const num = (v: unknown) => Number(v) || 0
    return {
      assetId: String(a.asset_id || ''),
      templateId: num(tpl.template_id),
      name: String(im.name || 'Land'),
      planet: String(im.planet || ''),
      rarity: String(im.rarity || ''),
      ease: num(im.ease),
      luck: num(im.luck),
      delay: num(im.delay),
      difficulty: num(im.difficulty),
      img: im.img ? String(im.img) : undefined,
    } as Land
  })
}
