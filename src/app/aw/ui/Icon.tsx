'use client'

import type { ReactNode } from 'react'

/**
 * Monochrome line icons (space / high-tech), drawn with currentColor so they
 * inherit the text color — no emoji, no color. 24x24 viewBox, round strokes.
 */
const P: Record<string, ReactNode> = {
  galaxy: <><circle cx="12" cy="12" r="2.4" /><ellipse cx="12" cy="12" rx="9.5" ry="4" /><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" /></>,
  buy: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.8v8.4M7.8 12h8.4" /></>,
  planet: <><circle cx="11" cy="11" r="5.5" /><ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(28 12 12)" /></>,
  gem: <><path d="M12 3l8 6-8 12-8-12z" /><path d="M4.5 9h15M9 3.5l3 5.5 3-5.5" /></>,
  vote: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12.5l2.6 2.6L16 9" /></>,
  teleport: <><path d="M4 8.5h12l-3.2-3.2" /><path d="M20 15.5H8l3.2 3.2" /></>,
  mine: <><path d="M4 20l8.5-8.5" /><path d="M6 9a7.5 7.5 0 0 1 9 9" /><path d="M13 4.5l6.5 6.5" /></>,
  rocket: <><path d="M12 2.5c2.8 1.9 4 5.4 4 8.7l-4 3.3-4-3.3c0-3.3 1.2-6.8 4-8.7z" /><circle cx="12" cy="9" r="1.3" /><path d="M8 14l-2.5 4M16 14l2.5 4" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" /></>,
  tag: <><path d="M4 4.5h7l9 9-6.5 6.5-9-9z" /><circle cx="8" cy="8.5" r="1.3" /></>,
  book: <><path d="M12 5v15" /><path d="M12 5c-1.8-1.4-4-1.8-7-1.8V18c3 0 5.2.4 7 1.8" /><path d="M12 5c1.8-1.4 4-1.8 7-1.8V18c-3 0-5.2.4-7 1.8" /></>,
  robot: <><rect x="5" y="7.5" width="14" height="11" rx="2.5" /><path d="M12 3.5v4" /><circle cx="12" cy="3.5" r="0.9" /><circle cx="9.5" cy="12.5" r="1.1" /><circle cx="14.5" cy="12.5" r="1.1" /><path d="M10 16h4" /></>,
  device: <><rect x="7" y="2.8" width="10" height="18.4" rx="2.2" /><path d="M10.5 18.4h3" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.2 5.2l2.3 2.3M16.5 16.5l2.3 2.3M18.8 5.2l-2.3 2.3M7.5 16.5l-2.3 2.3" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] ?? P.wallet}
    </svg>
  )
}
