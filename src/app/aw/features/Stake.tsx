'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Stake() {
  return (
    <>
      <PageHead title="Stake Trilium" desc="Convert Trilium into planet tokens and stake for rewards and voting power." />
      <FeatureStub
        phase="Phase 1"
        lines={[
          'Convert Trilium (TLM) ⇄ planet token, 1:1 and reversible.',
          'Stake / unstake to a planet for higher daily Trilium rewards + voting weight.',
          'Requires the WAX transaction signer added in the fork build.',
        ]}
        actions={['Convert', 'Stake', 'Unstake']}
      />
    </>
  )
}
