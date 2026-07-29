'use client'

import { useRef, useState } from 'react'
import s from '../aw.module.css'
import { getAccountProfile, type AccountProfile } from '../lib/aw/account'
import { usePrices } from '../lib/aw/usePrices'
import { usdFor, fmtUsd } from '../lib/aw/prices'
import { fmt } from '../lib/waxData'

function ageOf(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()
  if (!then) return '—'
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days < 0) return '—'
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30)
  return y > 0 ? `${y}y ${mo}mo` : days > 30 ? `${mo}mo` : `${days}d`
}

/** A WAX account name that reveals an on-chain profile card on hover/focus. */
export default function AccountName({
  name, role, votePower, voters, pay,
}: { name: string; role?: string; votePower?: string; voters?: number; pay?: string }) {
  const [open, setOpen] = useState(false)
  const [prof, setProf] = useState<AccountProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prices = usePrices()

  const show = () => {
    if (closeT.current) clearTimeout(closeT.current)
    setOpen(true)
    if (!prof && !loading) { setLoading(true); getAccountProfile(name).then(setProf).finally(() => setLoading(false)) }
  }
  const hide = () => { closeT.current = setTimeout(() => setOpen(false), 150) }

  const usdT = (amt: number) => { const v = usdFor('TLM', amt, prices); return v == null ? '' : ' ' + fmtUsd(v) }
  const usdW = (amt: number) => { const v = usdFor('WAX', amt, prices); return v == null ? '' : ' ' + fmtUsd(v) }

  return (
    <span className={s.acctWrap} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} tabIndex={0}>
      <span className={s.acctTrigger}>{name}</span>
      {open && (
        <span className={s.acctPop} onMouseEnter={show} onMouseLeave={hide}>
          <span className={s.acctHead}>{name}{role ? ` · ${role}` : ''}</span>
          <span className={s.acctGrid}>
            {votePower !== undefined && <><i>Vote power</i><b>{(Number(votePower) / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></>}
            {voters !== undefined && <><i>Voters</i><b>{voters}</b></>}
            {pay && <><i>Pay rate</i><b>{pay}</b></>}
            <><i>Account age</i><b>{loading && !prof ? '…' : ageOf(prof?.createdISO ?? null)}</b></>
            <><i>WAX</i><b>{prof ? fmt(prof.wax) + usdW(prof.wax) : '…'}</b></>
            <><i>Trilium</i><b>{prof ? fmt(prof.tlm) + usdT(prof.tlm) : '…'}</b></>
            <><i>NFTs held</i><b>{prof ? prof.nftCount : '…'}</b></>
            <><i>NFTs sold</i><b>{prof ? `${prof.soldCount}${prof.soldCapped ? '+' : ''} · ${fmt(prof.soldVolumeWax)} WAX` : '…'}</b></>
          </span>
          <span className={s.acctNote}>Tenure & lifetime custodian pay need deep indexing — showing current on-chain data.</span>
        </span>
      )}
    </span>
  )
}
