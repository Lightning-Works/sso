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
import StubView from './ui/StubView'

export type NavChild = { id: string; label: string; render: (p: FeatureProps) => ReactNode }
export type NavGroup = { id: string; label: string; icon: string; children: NavChild[] }

const stub = (phase: string, title: string, lines: string[], actions?: string[]) =>
  () => <StubView title={title} phase={phase} lines={lines} actions={actions} />

export const NAV: NavGroup[] = [
  {
    id: 'wallet', label: 'Wallet', icon: 'wallet', children: [
      { id: 'wallet.overview', label: 'Overview', render: p => <Balances {...p} /> },
      { id: 'wallet.staking', label: 'Staking (WAX)', render: p => <Staking {...p} /> },
      { id: 'wallet.send', label: 'Send', render: stub('Phase 1', 'Send', ['Send WAX, Trilium or planet tokens to another account.'], ['Send']) },
      { id: 'wallet.receive', label: 'Receive', render: stub('Phase 1', 'Receive', ['Show your account name and a QR code to receive tokens.']) },
      { id: 'wallet.activity', label: 'Activity', render: stub('Phase 1', 'Activity', ['Recent transactions on your account.']) },
    ],
  },
  {
    id: 'buy', label: 'Buy Trilium', icon: 'trilium', children: [
      { id: 'buy.card', label: 'With Card', render: () => <BuyTrilium /> },
      { id: 'buy.swap', label: 'Swap to TLM', render: stub('Phase 2', 'Swap to Trilium', ['Swap USDT → TLM on Binance, or WAX → TLM on Alcor.', 'Auto-routes to the cheapest path.'], ['Swap']) },
    ],
  },
  {
    id: 'syndicates', label: 'Syndicates', icon: 'planet', children: [
      { id: 'syn.all', label: 'All Planets', render: p => <Syndicates {...p} /> },
      ...PLANETS.map(pl => ({
        id: `syn.${pl.symbol}`, label: pl.name,
        render: (p: FeatureProps) => <PlanetDetail {...p} planet={pl.name} />,
      })),
    ],
  },
  {
    id: 'teleporter', label: 'Teleporter', icon: 'teleport', children: [
      { id: 'tp.all', label: 'All flows', render: () => <Teleporter /> },
    ],
  },
  {
    id: 'mine', label: 'Mine', icon: 'mine', children: [
      { id: 'mine.auto', label: 'Auto-Mine', render: p => <AutoMine {...p} /> },
      { id: 'mine.advisor', label: 'Tool Advisor', render: p => <ToolAdvisor {...p} /> },
      { id: 'mine.upgrade', label: 'Upgrade Advisor', render: p => <PurchaseAdvisor {...p} /> },
      { id: 'mine.mine', label: 'Mine (manual)', render: stub('Phase 4', 'Mine', ['Equip a Land and up to 3 tools, then mine Trilium + NFTs.', 'Cooldown = combined tool delay; ease lowers proof-of-work; luck drives NFT drops.'], ['Mine']) },
      { id: 'mine.claim', label: 'Claim Rewards', render: stub('Phase 4', 'Claim Rewards', ['Claim mined Trilium and NFT game cards (m.federation::claimmines).'], ['Claim']) },
      { id: 'mine.land', label: 'My Land', render: stub('Phase 4', 'My Land', ['Land you own and commission earned from miners.']) },
    ],
  },
  {
    id: 'missions', label: 'Missions', icon: 'rocket', children: [
      { id: 'mis.send', label: 'Send Mission', render: stub('Phase 4', 'Send a Mission', ['Lock Trilium on Binance to send a mining spacecraft (40–2000 TLM).', 'Earn a share of the reward pool + up to 5 NFTs per mission.'], ['Launch']) },
      { id: 'mis.mine', label: 'My Missions', render: stub('Phase 4', 'My Missions', ['Active and completed missions, lockups and rewards.']) },
      { id: 'mis.adv', label: 'Adventures', render: stub('Phase 4', 'Adventures', ['Send your NFTs on 24h adventures for Reward Points and XP.'], ['Send on adventure']) },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: 'grid', children: [
      { id: 'inv.all', label: 'All', render: p => <Inventory {...p} /> },
      { id: 'inv.land', label: 'Land', render: p => <Inventory {...p} schema="land.worlds" label="Land" /> },
      { id: 'inv.tools', label: 'Tools', render: p => <Inventory {...p} schema="tool.worlds" label="Tools" /> },
      { id: 'inv.avatars', label: 'Avatars', render: p => <Inventory {...p} schema="face.worlds" label="Avatars" /> },
      { id: 'inv.weapons', label: 'Weapons', render: p => <Inventory {...p} schema="arms.worlds" label="Weapons" /> },
      { id: 'inv.crew', label: 'Crew', render: p => <Inventory {...p} schema="crew.worlds" label="Crew" /> },
      { id: 'inv.shine', label: 'Shine (Forge)', render: stub('Phase 4', 'Shine — Forge NFTs', ['Forge 4 identical NFTs into one of higher shine: Stone → Gold → Stardust → Antimatter.', 'Higher shine boosts attributes and value.'], ['Shine']) },
      { id: 'inv.shards', label: 'Shards / Outpost', render: stub('Phase 4', 'Shards & NFT Outpost', ['Shards (NFT points) are earned by mining.', 'Fuse shards at the NFT Outpost to craft new tools.'], ['Fuse shards']) },
    ],
  },
  {
    id: 'market', label: 'Market', icon: 'tag', children: [
      { id: 'mkt.all', label: 'All', render: () => <Market /> },
      { id: 'mkt.tools', label: 'Tools', render: () => <Market schema="tool.worlds" label="Tools" /> },
      { id: 'mkt.land', label: 'Land', render: () => <Market schema="land.worlds" label="Land" /> },
      { id: 'mkt.weapons', label: 'Weapons', render: () => <Market schema="arms.worlds" label="Weapons" /> },
    ],
  },
  {
    id: 'comics', label: 'Comics', icon: 'book', children: [
      { id: 'comics.lib', label: 'Library', render: stub('Phase 4', 'Comics Library', ['Alien Worlds comic NFTs you own — page-flip and webtoon formats.'], ['Open']) },
    ],
  },
  {
    id: 'assistant', label: 'Assistant', icon: 'robot', children: [
      { id: 'asst.chat', label: 'Chat', render: stub('kept', 'Assistant', ['Your built-in AI character and wallet helper.'], ['Open chat']) },
    ],
  },
  {
    id: 'device', label: 'Device Type', icon: 'device', children: [
      { id: 'dev.desktop', label: 'Desktop', render: () => <DeviceEmulator kind="desktop" /> },
      { id: 'dev.tablet', label: 'Tablet', render: () => <DeviceEmulator kind="tablet" /> },
      { id: 'dev.phone', label: 'Phone', render: () => <DeviceEmulator kind="phone" /> },
    ],
  },
]

export const FIRST = NAV[0].children[0].id
