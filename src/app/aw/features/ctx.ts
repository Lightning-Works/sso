import type { Holdings, Planet } from '../lib/waxData'

/** Shared state passed to every feature module. */
export type FeatureProps = {
  holdings: Holdings | null
  planets: Planet[]
  account: string
}
