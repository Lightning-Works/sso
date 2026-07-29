'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Mine() {
  return (
    <>
      <PageHead title="Mine" desc="Mine Trilium and claim the NFTs you have earned." />
      <FeatureStub
        phase="Phase 4"
        lines={[
          'Mine on your land or others’ land with your equipped tools.',
          'Claim mined Trilium and NFT game cards.',
          'Land owners collect commission from miners.',
        ]}
        actions={['Mine', 'Claim rewards']}
      />
    </>
  )
}
