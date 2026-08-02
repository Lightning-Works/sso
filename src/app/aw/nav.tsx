'use client'

/**
 * Navigation outline — the single place features + sub-features are wired in.
 * Two levels: a group (top-level feature) expands to reveal its children
 * (sub-features). To add a sub-feature: add one child row. To add a feature:
 * add one group.
 */
import type { ReactNode } from 'react'
import type { FeatureProps } from './features/ctx'
import { PLANETS } from './lib/waxData'
import Balances from './features/Balances'
import Staking from './features/Staking'
import DiviGoConnect from './features/DiviGoConnect'
import Syndicates from './features/Syndicates'
import PlanetDetail from './features/PlanetDetail'
import Inventory from './features/Inventory'
import BuyTrilium from './features/BuyTrilium'
import Teleporter from './features/Teleporter'
import AutoMine from './features/AutoMine'
import ToolAdvisor from './features/ToolAdvisor'
import PurchaseAdvisor from './features/PurchaseAdvisor'
import Market from './features/Market'
import DeviceEmulator from './features/DeviceEmulator'
import MiningData from './features/MiningData'
import StubView from './ui/StubView'

export type NavChild = { id: string; label: string; slug: string; render: (p: FeatureProps) => ReactNode }
export type NavGroup = { id: string; label: string; icon: string; slug: string; children: NavChild[] }

const stub = (phase: string, title: string, lines: string[], actions?: string[]) =>
  () => <StubView title={title} phase={phase} lines={lines} actions={actions} />

export const NAV: NavGroup[] = [
  {
    id: 'wallet', label: 'Wallet', icon: 'wallet', slug: 'wallet', children: [
      { id: 'wallet.overview', label: 'Overview', slug: 'overview', render: p => <Balances {...p} /> },
      { id: 'wallet.staking', label: 'Staking (WAX)', slug: 'staking', render: p => <Staking {...p} /> },
      { id: 'wallet.send', label: 'Send', slug: 'send', render: stub('Phase 1', 'Send', ['Send WAX, Trilium or planet tokens to another account.'], ['Send']) },
      { id: 'wallet.receive', label: 'Receive', slug: 'receive', render: stub('Phase 1', 'Receive', ['Show your account name and a QR code to receive tokens.']) },
      { id: 'wallet.activity', label: 'Activity', slug: 'activity', render: stub('Phase 1', 'Activity', ['Recent transactions on your account.']) },
      { id: 'wallet.divigo', label: 'DiviGo (Telegram)', slug: 'divigo', render: () => <DiviGoConnect /> },
    ],
  },
  {
    id: 'buy', label: 'Buy Trilium', icon: 'trilium', slug: 'buy-trilium', children: [
      { id: 'buy.card', label: 'With Card', slug: 'card', render: () => <BuyTrilium /> },
      { id: 'buy.swap', label: 'Swap to TLM', slug: 'swap', render: stub('Phase 2', 'Swap to Trilium', ['Swap USDT → TLM on Binance, or WAX → TLM on Alcor.', 'Auto-routes to the cheapest path.'], ['Swap']) },
    ],
  },
  {
    id: 'syndicates', label: 'Syndicates', icon: 'planet', slug: 'syndicates', children: [
      { id: 'syn.all', label: 'All Planets', slug: 'all', render: p => <Syndicates {...p} /> },
      ...PLANETS.map(pl => ({
        id: `syn.${pl.symbol}`, label: pl.name, slug: pl.name.toLowerCase(),
        render: (p: FeatureProps) => <PlanetDetail {...p} planet={pl.name} />,
      })),
    ],
  },
  {
    id: 'teleporter', label: 'Teleporter', icon: 'teleport', slug: 'teleporter', children: [
      { id: 'tp.all', label: 'All flows', slug: 'all', render: () => <Teleporter /> },
    ],
  },
  {
    id: 'mine', label: 'Mine', icon: 'mine', slug: 'mining', children: [
      { id: 'mine.auto', label: 'Auto-Mine', slug: 'auto-mine', render: p => <AutoMine {...p} /> },
      { id: 'mine.advisor', label: 'Tool Advisor', slug: 'tool-advisor', render: p => <ToolAdvisor {...p} /> },
      { id: 'mine.upgrade', label: 'Upgrade Advisor', slug: 'upgrade-advisor', render: p => <PurchaseAdvisor {...p} /> },
      { id: 'mine.mine', label: 'Mine (manual)', slug: 'mine', render: stub('Phase 4', 'Mine', ['Equip a Land and up to 3 tools, then mine Trilium + NFTs.', 'Cooldown = combined tool delay; ease lowers proof-of-work; luck drives NFT drops.'], ['Mine']) },
      { id: 'mine.claim', label: 'Claim Rewards', slug: 'claim', render: stub('Phase 4', 'Claim Rewards', ['Claim mined Trilium and NFT game cards (m.federation::claimmines).'], ['Claim']) },
      { id: 'mine.land', label: 'My Land', slug: 'land', render: stub('Phase 4', 'My Land', ['Land you own and commission earned from miners.']) },
    ],
  },
  {
    id: 'missions', label: 'Missions', icon: 'rocket', slug: 'missions', children: [
      { id: 'mis.send', label: 'Send Mission', slug: 'send', render: stub('Phase 4', 'Send a Mission', ['Lock Trilium on Binance to send a mining spacecraft (40–2000 TLM).', 'Earn a share of the reward pool + up to 5 NFTs per mission.'], ['Launch']) },
      { id: 'mis.mine', label: 'My Missions', slug: 'my-missions', render: stub('Phase 4', 'My Missions', ['Active and completed missions, lockups and rewards.']) },
      { id: 'mis.adv', label: 'Adventures', slug: 'adventures', render: stub('Phase 4', 'Adventures', ['Send your NFTs on 24h adventures for Reward Points and XP.'], ['Send on adventure']) },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: 'grid', slug: 'inventory', children: [
      { id: 'inv.all', label: 'All', slug: 'all', render: p => <Inventory {...p} /> },
      { id: 'inv.land', label: 'Land', slug: 'land', render: p => <Inventory {...p} schema="land.worlds" label="Land" /> },
      { id: 'inv.tools', label: 'Tools', slug: 'tools', render: p => <Inventory {...p} schema="tool.worlds" label="Tools" /> },
      { id: 'inv.avatars', label: 'Avatars', slug: 'avatars', render: p => <Inventory {...p} schema="face.worlds" label="Avatars" /> },
      { id: 'inv.weapons', label: 'Weapons', slug: 'weapons', render: p => <Inventory {...p} schema="arms.worlds" label="Weapons" /> },
      { id: 'inv.crew', label: 'Crew', slug: 'crew', render: p => <Inventory {...p} schema="crew.worlds" label="Crew" /> },
      { id: 'inv.shine', label: 'Shine (Forge)', slug: 'shine', render: stub('Phase 4', 'Shine — Forge NFTs', ['Forge 4 identical NFTs into one of higher shine: Stone → Gold → Stardust → Antimatter.', 'Higher shine boosts attributes and value.'], ['Shine']) },
      { id: 'inv.shards', label: 'Shards / Outpost', slug: 'shards', render: stub('Phase 4', 'Shards & NFT Outpost', ['Shards (NFT points) are earned by mining.', 'Fuse shards at the NFT Outpost to craft new tools.'], ['Fuse shards']) },
    ],
  },
  {
    id: 'market', label: 'Market', icon: 'tag', slug: 'market', children: [
      { id: 'mkt.all', label: 'All', slug: 'all', render: () => <Market /> },
      { id: 'mkt.tools', label: 'Tools', slug: 'tools', render: () => <Market schema="tool.worlds" label="Tools" /> },
      { id: 'mkt.land', label: 'Land', slug: 'land', render: () => <Market schema="land.worlds" label="Land" /> },
      { id: 'mkt.weapons', label: 'Weapons', slug: 'weapons', render: () => <Market schema="arms.worlds" label="Weapons" /> },
    ],
  },
  {
    id: 'comics', label: 'Comics', icon: 'book', slug: 'comics', children: [
      { id: 'comics.lib', label: 'Library', slug: 'library', render: stub('Phase 4', 'Comics Library', ['Alien Worlds comic NFTs you own — page-flip and webtoon formats.'], ['Open']) },
    ],
  },
  {
    id: 'assistant', label: 'Assistant', icon: 'robot', slug: 'assistant', children: [
      { id: 'asst.chat', label: 'Chat', slug: 'chat', render: stub('kept', 'Assistant', ['Your built-in AI character and wallet helper.'], ['Open chat']) },
    ],
  },
  {
    id: 'device', label: 'Device Type', icon: 'device', slug: 'device', children: [
      { id: 'dev.desktop', label: 'Desktop', slug: 'desktop', render: () => <DeviceEmulator kind="desktop" /> },
      { id: 'dev.tablet', label: 'Tablet', slug: 'tablet', render: () => <DeviceEmulator kind="tablet" /> },
      { id: 'dev.phone', label: 'Phone', slug: 'phone', render: () => <DeviceEmulator kind="phone" /> },
    ],
  },
  {
    id: 'admin', label: 'Admin', icon: 'gear', slug: 'admin', children: [
      { id: 'admin.mining', label: 'Mining Data', slug: 'mining-data', render: () => <MiningData /> },
    ],
  },
]

export const FIRST = NAV[0].children[0].id

/**
 * URL <-> nav mapping. Human-readable paths like /aw/syndicates/kavian.
 * Root /aw is the first child (Wallet › Overview); a group's first child is the
 * bare group path (/aw/syndicates = All Planets); everything else is
 * /aw/{group}/{child}.
 */
export function pathForChild(childId: string): string {
  const g = NAV.find(x => x.children.some(c => c.id === childId))
  if (!g) return '/aw'
  const idx = g.children.findIndex(c => c.id === childId)
  if (childId === FIRST) return '/aw'
  if (idx === 0) return `/aw/${g.slug}`
  return `/aw/${g.slug}/${g.children[idx].slug}`
}

/** Resolve URL segments (after /aw) to a nav child id; falls back to FIRST. */
export function childForPath(segments: string[]): string {
  if (!segments || segments.length === 0) return FIRST
  const g = NAV.find(x => x.slug === segments[0])
  if (!g) return FIRST
  if (!segments[1]) return g.children[0].id
  const c = g.children.find(x => x.slug === segments[1])
  return c ? c.id : g.children[0].id
}
