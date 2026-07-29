'use client'

/**
 * Navigation registry — the single place features are wired in.
 * To add a feature: create features/Thing.tsx and add one row here.
 */
import type { ReactNode } from 'react'
import type { FeatureProps } from './features/ctx'
import Balances from './features/Balances'
import Syndicates from './features/Syndicates'
import Stake from './features/Stake'
import Vote from './features/Vote'
import Teleporter from './features/Teleporter'
import Mine from './features/Mine'
import Inventory from './features/Inventory'
import Comics from './features/Comics'
import Assistant from './features/Assistant'

export type NavItem = { id: string; label: string; icon: string; render: (p: FeatureProps) => ReactNode }

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🪐', render: p => <Balances {...p} /> },
  { id: 'syndicates', label: 'Syndicates', icon: '🛰️', render: p => <Syndicates {...p} /> },
  { id: 'stake', label: 'Stake', icon: '💎', render: () => <Stake /> },
  { id: 'vote', label: 'Vote', icon: '🗳️', render: () => <Vote /> },
  { id: 'teleporter', label: 'Teleporter', icon: '🌀', render: () => <Teleporter /> },
  { id: 'mine', label: 'Mine', icon: '⛏️', render: () => <Mine /> },
  { id: 'inventory', label: 'Inventory', icon: '🎒', render: p => <Inventory {...p} /> },
  { id: 'comics', label: 'Comics', icon: '📖', render: () => <Comics /> },
  { id: 'assistant', label: 'Assistant', icon: '🤖', render: () => <Assistant /> },
]
