'use client'

import s from '../aw.module.css'
import { PageHead } from '../ui/primitives'

const SIZES = {
  desktop: { w: 1280, h: 800, label: 'Desktop' },
  tablet: { w: 834, h: 1112, label: 'Tablet' },
  phone: { w: 390, h: 844, label: 'Phone' },
} as const

/**
 * Emulates the wallet at a device size by loading /aw in a same-origin iframe
 * sized to the device — the iframe has its own viewport, so the real responsive
 * CSS reacts exactly as it would on that device. `?frame=1` hides this Device
 * group inside the iframe to avoid recursion.
 */
export default function DeviceEmulator({ kind }: { kind: keyof typeof SIZES }) {
  const d = SIZES[kind]
  return (
    <>
      <PageHead title={`${d.label} preview`} desc={`The real wallet in a ${d.w}×${d.h} ${d.label.toLowerCase()} viewport — resize the window and it stays live.`} />
      <div className={s.deviceStage}>
        <div className={s.deviceFrame} style={{ width: d.w, height: d.h }}>
          <iframe className={s.deviceIframe} src="/aw?frame=1" title={`${d.label} preview`} />
        </div>
      </div>
    </>
  )
}
