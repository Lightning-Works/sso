'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Teleporter() {
  return (
    <>
      <PageHead title="Teleporter" desc="Move Trilium between WAX and Binance Smart Chain." />
      <FeatureStub
        phase="Phase 3 · prototype-gated"
        lines={[
          'Teleport Trilium from WAX to Binance and back (minimum 100 TLM).',
          'WAX-side send, then claim on Binance via Metamask using the oracle proof.',
          'Highest-risk piece — prototyped against the Alien Worlds oracle before launch.',
        ]}
        actions={['WAX → Binance', 'Binance → WAX', 'Claim']}
      />
    </>
  )
}
