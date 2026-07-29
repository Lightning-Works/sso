'use client'

import { PageHead, FeatureStub } from '../ui/primitives'

export default function Assistant() {
  return (
    <>
      <PageHead title="Assistant" desc="Your built-in AI character and wallet helper." />
      <FeatureStub
        phase="kept"
        lines={[
          'Built-in AI character, rebranded from the SSO chat embed.',
          'Answer questions, guide staking and voting, surface opportunities.',
          'Kept as a distinctive Alien Worlds Wallet feature.',
        ]}
        actions={['Open chat']}
      />
    </>
  )
}
