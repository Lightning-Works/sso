import type { Holdings, Planet } from '../lib/waxData'

/** Shared state passed to every feature module. */
export type FeatureProps = {
  holdings: Holdings | null
  planets: Planet[]
  account: string
  /** Navigate to a nav child id (e.g. 'syn.MAG') — same as clicking the left nav. */
  navigate: (childId: string) => void
}
