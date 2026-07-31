'use client'

import s from '../aw.module.css'

/** Shown on /aw when the visitor is not logged into the SSO. */
export function LoginGate() {
  return (
    <div className={s.gateWrap}>
      <div className={s.gateCard}>
        <img src="/aww/aw-logo.webp" alt="Alien Worlds" className={s.gateLogo} />
        <div className={s.gateTitle}>Alien Worlds Wallet</div>
        <div className={s.gateSub}>Log in to see your Alien Worlds NFTs, WAX and Trilium.</div>
        <a
          className={`${s.btn} ${s.btnPrimary}`}
          href="/login"
          style={{ display: 'block', width: '100%', marginTop: 12, textAlign: 'center', textDecoration: 'none' }}
        >
          Log in
        </a>
      </div>
    </div>
  )
}
