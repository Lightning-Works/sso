/**
 * "Which tool should I buy?" — best-value upgrade engine.
 *
 * Takes the tools you own + live market offers, and finds buyable tools that,
 * swapped into your best 3-tool loadout, most improve your mining rate PER WAX
 * SPENT. Mining rate proxy = total luck ÷ total delay (TLM/hr ∝ luck ÷ delay,
 * verified from the mining contract). Ranked by improvement-per-WAX so the top
 * pick is the biggest bang for your buck, not just the biggest (or cheapest).
 */
import { bestForTlm, type Tool } from './tools'
import type { ToolOffer } from './market'

export type Upgrade = {
  offer: ToolOffer
  gainPct: number      // % improvement to your mining rate if you buy + equip it
  valueScore: number   // gainPct per 1000 WAX — the ranking metric
}

const rateOf = (tools: Tool[]): number => {
  const l = tools.reduce((s, t) => s + t.luck, 0)
  const d = tools.reduce((s, t) => s + t.delay, 0)
  return d > 0 ? l / d : 0
}

export function bestValueUpgrades(owned: Tool[], offers: ToolOffer[], topN = 8): Upgrade[] {
  const current = bestForTlm(owned).tools
  const currentRate = rateOf(current)

  const out: Upgrade[] = []
  const seen = new Set<number>()
  for (const o of offers) {
    if (o.price <= 0 || seen.has(o.templateId)) continue
    seen.add(o.templateId)
    // Best 3 from your tools PLUS this candidate.
    const best = bestForTlm([...owned, o])
    const usesCandidate = best.tools.some(t => t.templateId === o.templateId && (t as ToolOffer).saleId === o.saleId)
    if (!usesCandidate) continue // candidate didn't make the top 3 → no upgrade
    const newRate = rateOf(best.tools)
    const gain = newRate - currentRate
    if (gain <= 1e-9) continue
    const gainPct = currentRate > 0 ? (gain / currentRate) * 100 : 100
    out.push({ offer: o, gainPct, valueScore: gainPct / (o.price / 1000) })
  }
  return out.sort((a, b) => b.valueScore - a.valueScore).slice(0, topN)
}
