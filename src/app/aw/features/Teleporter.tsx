'use client'

import s from '../aw.module.css'
import { PageHead, Card } from '../ui/primitives'

function Panel({ title, phase, lines, action }: { title: string; phase: string; lines: string[]; action: string }) {
  return (
    <Card title={title} tag={phase}>
      <ul className={s.stub}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className={s.stubActions}>
        <button className={`${s.btn} ${s.btnGhost}`} disabled title="Coming in the fork build">{action}</button>
      </div>
    </Card>
  )
}

/** All three teleporter flows on one page. */
export default function Teleporter() {
  return (
    <>
      <PageHead title="Teleporter" desc="Move Trilium between WAX and Binance — all flows in one place." />
      <Panel
        title="WAX → Binance"
        phase="Phase 3 · prototype-gated"
        lines={['Send Trilium from WAX to Binance Smart Chain (minimum 100 TLM).', 'WAX-side send, then claim on Binance via Metamask using the oracle proof.']}
        action="Teleport WAX → Binance"
      />
      <Panel
        title="Binance → WAX"
        phase="Phase 3 · prototype-gated"
        lines={['Send Trilium from Binance Smart Chain back to WAX.']}
        action="Teleport Binance → WAX"
      />
      <Panel
        title="History"
        phase="Phase 3"
        lines={['Your past teleports and their claim status.']}
        action="View history"
      />
    </>
  )
}
