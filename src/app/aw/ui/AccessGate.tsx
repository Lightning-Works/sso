'use client'

import { useState } from 'react'
import s from '../aw.module.css'
import { AW_ACCESS_CODE } from '../lib/access'

/** Simple access-code screen shown on /aw until the correct code is entered. */
export function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)

  const submit = () => {
    if (code.trim() === AW_ACCESS_CODE) {
      try { localStorage.setItem('aww-access', AW_ACCESS_CODE) } catch { /* ignore */ }
      onUnlock()
    } else setErr(true)
  }

  return (
    <div className={s.gateWrap}>
      <div className={s.gateCard}>
        <img src="/aww/aw-logo.webp" alt="Alien Worlds" className={s.gateLogo} />
        <div className={s.gateTitle}>Alien Worlds Wallet</div>
        <div className={s.gateSub}>Enter the access code to continue.</div>
        <input
          className={s.input}
          type="password"
          placeholder="Access code"
          value={code}
          onChange={e => { setCode(e.target.value); setErr(false) }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          autoFocus
        />
        {err && <div className={s.err} style={{ marginTop: 8 }}>Incorrect code</div>}
        <button className={`${s.btn} ${s.btnPrimary}`} style={{ width: '100%', marginTop: 12 }} onClick={submit}>Enter</button>
      </div>
    </div>
  )
}
