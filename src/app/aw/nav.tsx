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
import Syndicates from './features/Syndicates'
import PlanetDetail from './features/PlanetDetail'
import Inventory from './features/Inventory'
import BuyTrilium from './features/BuyTrilium'
import AutoMine from './features/AutoMine'
import ToolAdvisor from './features/ToolAdvisor'
import PurchaseAdvisor from './features/PurchaseAdvisor'
import Market from './features/Market'
import StubView from './ui/StubView'

export type NavChild = { id: string; label: string; render: (p: FeatureProps) => ReactNode }
export type NavGroup = { id: string; label: string; icon: string; children: NavChild[] }

const stub = (phase: string, title: string, lines: string[], actions?: string[]) =>
  () => <StubView title={title} phase={phase} lines={lines} actions={actions} />

export const NAV: NavGroup[] = [
  {
    id: 'wallet', label: 'Wallet', icon: '💼', children: [
      { id: 'wallet.overview', label: 'Overview', render: p => <Balances {...p} /> },
      { id: 'wallet.send', label: 'Send', render: stub('Phase 1', 'Send', ['Send WAX, Trilium or planet tokens to another account.'], ['Send']) },
      { id: 'wallet.receive', label: 'Receive', render: stub('Phase 1', 'Receive', ['Show your account name and a QR code to receive tokens.']) },
      { id: 'wallet.activity', label: 'Activity', render: stub('Phase 1', 'Activity', ['Recent transactions on your account.']) },
    ],
  },
  {
    id: 'buy', label: 'Buy Trilium', icon: '💰', children: [
      { id: 'buy.card', label: 'With Card', render: () => <BuyTrilium /> },
      { id: 'buy.swap', label: 'Swap to TLM', render: stub('Phase 2', 'Swap to Trilium', ['Swap USDT → TLM on Binance, or WAX → TLM on Alcor.', 'Auto-routes to the cheapest path.'], ['Swap']) },
    ],
  },
  {
    id: 'syndicates', label: 'Syndicates', icon: '🛰️', children: [
      { id: 'syn.all', label: 'All Planets', render: p => <Syndicates {...p} /> },
      ...PLANETS.map(pl => ({
        id: `syn.${pl.symbol}`, label: pl.name,
        render: (p: FeatureProps) => <PlanetDetail {...p} planet={pl.name} />,
      })),
    ],
  },
  {
    id: 'stake', label: 'Stake', icon: '💎', children: [
      { id: 'stake.stake', label: 'Stake', render: stub('Phase 1', 'Stake Trilium', ['Stake a planet token for voting power and higher daily rewards.', 'Signs on-chain via token.worlds::stake.'], ['Stake']) },
      { id: 'stake.unstake', label: 'Unstake', render: stub('Phase 1', 'Unstake', ['Begin unstaking, then claim after the lockup delay.', 'token.worlds::unstake + claimunstkes.'], ['Unstake', 'Claim']) },
      { id: 'stake.convert', label: 'Convert', render: stub('Phase 1', 'Convert Trilium', ['Convert Trilium ⇄ planet token (1:1, reversible).', 'Exact on-chain action being confirmed.']) },
      { id: 'stake.mine', label: 'My Stakes', render: stub('Phase 1', 'My Stakes', ['Your staked planet tokens and unlock times.']) },
    ],
  },
  {
    id: 'vote', label: 'Vote', icon: '🗳️', children: [
      { id: 'vote.cast', label: 'Cast Votes', render: stub('Phase 2', 'Cast Votes', ['Vote for up to 2 custodian candidates per planet, weekly.', 'dao.worlds::votecust.'], ['Vote']) },
      { id: 'vote.mine', label: 'My Votes', render: stub('Phase 2', 'My Votes', ['See who you are currently voting for on each planet.']) },
      { id: 'vote.run', label: 'Run for Council', render: stub('Phase 2', 'Run for Council', ['Register as a candidate (convert + stake 5,000 Trilium).', 'dao.worlds::nominatecane.'], ['Nominate']) },
    ],
  },
  {
    id: 'teleporter', label: 'Teleporter', icon: '🌀', children: [
      { id: 'tp.out', label: 'WAX → Binance', render: stub('Phase 3 · prototype-gated', 'Teleport WAX → Binance', ['Send Trilium from WAX to Binance Smart Chain (min 100 TLM).'], ['Teleport']) },
      { id: 'tp.in', label: 'Binance → WAX', render: stub('Phase 3 · prototype-gated', 'Teleport Binance → WAX', ['Send Trilium from Binance back to WAX.'], ['Teleport']) },
      { id: 'tp.history', label: 'History', render: stub('Phase 3', 'Teleport History', ['Past teleports and their claim status.']) },
    ],
  },
  {
    id: 'mine', label: 'Mine', icon: '⛏️', children: [
      { id: 'mine.auto', label: 'Auto-Mine', render: p => <AutoMine {...p} /> },
      { id: 'mine.advisor', label: 'Tool Advisor', render: p => <ToolAdvisor {...p} /> },
      { id: 'mine.upgrade', label: 'Upgrade Advisor', render: p => <PurchaseAdvisor {...p} /> },
      { id: 'mine.mine', label: 'Mine (manual)', render: stub('Phase 4', 'Mine', ['Equip a Land and up to 3 tools, then mine Trilium + NFTs.', 'Cooldown = combined tool delay; ease lowers proof-of-work; luck drives NFT drops.'], ['Mine']) },
      { id: 'mine.claim', label: 'Claim Rewards', render: stub('Phase 4', 'Claim Rewards', ['Claim mined Trilium and NFT game cards (m.federation::claimmines).'], ['Claim']) },
      { id: 'mine.land', label: 'My Land', render: stub('Phase 4', 'My Land', ['Land you own and commission earned from miners.']) },
    ],
  },
  {
    id: 'missions', label: 'Missions', icon: '🚀', children: [
      { id: 'mis.send', label: 'Send Mission', render: stub('Phase 4', 'Send a Mission', ['Lock Trilium on Binance to send a mining spacecraft (40–2000 TLM).', 'Earn a share of the reward pool + up to 5 NFTs per mission.'], ['Launch']) },
      { id: 'mis.mine', label: 'My Missions', render: stub('Phase 4', 'My Missions', ['Active and completed missions, lockups and rewards.']) },
      { id: 'mis.adv', label: 'Adventures', render: stub('Phase 4', 'Adventures', ['Send your NFTs on 24h adventures for Reward Points and XP.'], ['Send on adventure']) },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: '🎒', children: [
      { id: 'inv.all', label: 'All', render: p => <Inventory {...p} /> },
      { id: 'inv.land', label: 'Land', render: p => <Inventory {...p} schema="land" /> },
      { id: 'inv.tools', label: 'Tools', render: p => <Inventory {...p} schema="tool" /> },
      { id: 'inv.avatars', label: 'Avatars', render: p => <Inventory {...p} schema="face" /> },
      { id: 'inv.weapons', label: 'Weapons', render: p => <Inventory {...p} schema="arms" /> },
      { id: 'inv.crew', label: 'Crew', render: p => <Inventory {...p} schema="crew" /> },
      { id: 'inv.shine', label: 'Shine (Forge)', render: stub('Phase 4', 'Shine — Forge NFTs', ['Forge 4 identical NFTs into one of higher shine: Stone → Gold → Stardust → Antimatter.', 'Higher shine boosts attributes and value.'], ['Shine']) },
      { id: 'inv.shards', label: 'Shards / Outpost', render: stub('Phase 4', 'Shards & NFT Outpost', ['Shards (NFT points) are earned by mining.', 'Fuse shards at the NFT Outpost to craft new tools.'], ['Fuse shards']) },
    ],
  },
  {
    id: 'market', label: 'Market', icon: '🛒', children: [
      { id: 'mkt.all', label: 'All', render: () => <Market /> },
      { id: 'mkt.tools', label: 'Tools', render: () => <Market schema="tool.worlds" label="Tools" /> },
      { id: 'mkt.land', label: 'Land', render: () => <Market schema="land.worlds" label="Land" /> },
      { id: 'mkt.weapons', label: 'Weapons', render: () => <Market schema="arms.worlds" label="Weapons" /> },
    ],
  },
  {
    id: 'comics', label: 'Comics', icon: '📖', children: [
      { id: 'comics.lib', label: 'Library', render: stub('Phase 4', 'Comics Library', ['Alien Worlds comic NFTs you own — page-flip and webtoon formats.'], ['Open']) },
    ],
  },
  {
    id: 'assistant', label: 'Assistant', icon: '🤖', children: [
      { id: 'asst.chat', label: 'Chat', render: stub('kept', 'Assistant', ['Your built-in AI character and wallet helper.'], ['Open chat']) },
    ],
  },
]

export const FIRST = NAV[0].children[0].id
