'use client'

import { PageHead, FeatureStub } from './primitives'

/** Generic view for a sub-feature that ships in a later phase. */
export default function StubView({
  title, phase, lines, actions,
}: { title: string; phase: string; lines: string[]; actions?: string[] }) {
  return (
    <>
      <PageHead title={title} />
      <FeatureStub phase={phase} lines={lines} actions={actions} />
    </>
  )
}
