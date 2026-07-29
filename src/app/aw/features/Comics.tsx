'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Comics() {
  return (
    <>
      <PageHead title="Comics" desc="Read the Alien Worlds comics you own as NFTs." />
      <FeatureStub
        phase="Phase 4"
        lines={[
          'Own an Alien Worlds comic NFT and unlock its reader.',
          'Both page-flip and webtoon vertical-scroll formats.',
          'Reader carried over from the SSO fork.',
        ]}
        actions={['Open library']}
      />
    </>
  )
}
