'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Vote() {
  return (
    <>
      <PageHead title="Vote" desc="Elect planet custodians and run for a council seat in the Syndicate DAOs." />
      <FeatureStub
        phase="Phase 2"
        lines={[
          'Cast or refresh up to 2 custodian votes per planet, each week.',
          'Register as a candidate (convert and stake 5,000 Trilium).',
          'Live candidate and custodian lists are already shown under Syndicates.',
        ]}
        actions={['Vote', 'Refresh votes', 'Run for council']}
      />
    </>
  )
}
