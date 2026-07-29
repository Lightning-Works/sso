'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import s from './aw.module.css'
import { NAV } from './nav'
import { useTheme } from './theme/useTheme'
import { StylingPanel } from './theme/StylingPanel'
import { fetchHoldings, fetchPlanets, type Holdings, type Planet } from './lib/waxData'

export default function AwwApp() {
  const { skinId, vars, setToken, applySkin, reset } = useTheme()

  const [active, setActive] = useState('dashboard')
  const [account, setAccount] = useState('')
  const [loaded, setLoaded] = useState('')
  const [holdings, setHoldings] = useState<Holdings | null>(null)
  const [planets, setPlanets] = useState<Planet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => { fetchPlanets().then(setPlanets).catch(() => setPlanets([])) }, [])

  const load = useCallback(async () => {
    const acct = account.trim().toLowerCase()
    if (!acct) return
    setLoading(true); setError(''); setHoldings(null)
    try {
      const data = await fetchHoldings(acct)
      setHoldings(data); setLoaded(acct)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [account])

  const current = NAV.find(n => n.id === active) ?? NAV[0]

  return (
    <div className={s.app} style={vars as unknown as CSSProperties}>
      {/* Sidebar */}
      <aside className={`${s.sidebar} ${navOpen ? s.sidebarOpen : ''}`}>
        <div className={s.brand}>
          <div className={s.brandMark}>🌌</div>
          <div>
            <div className={s.brandName}>Alien Worlds</div>
            <div className={s.brandSub}>WALLET</div>
          </div>
        </div>
        {NAV.map(n => (
          <button
            key={n.id}
            className={`${s.navItem} ${n.id === active ? s.navItemActive : ''}`}
            onClick={() => { setActive(n.id); setNavOpen(false) }}
          >
            <span className={s.navIcon}>{n.icon}</span>
            <span className={s.navFill}>{n.label}</span>
          </button>
        ))}
        <div className={s.navSpacer} />
        <div className={s.navFoot}>Preview build · reads live WAX chain data</div>
      </aside>

      {/* Main */}
      <div className={s.main}>
        <header className={s.topbar}>
          <button className={`${s.iconBtn} ${s.hamburger}`} onClick={() => setNavOpen(o => !o)} aria-label="Menu">☰</button>
          <span className={s.crumb}>{current.label}</span>
          <div className={s.grow} />
          <div className={s.account}>
            <span className={`${s.dot} ${loaded ? '' : s.dotOff}`} />
            <input
              className={s.acctInput}
              placeholder="WAX account (e.g. name.wam)"
              value={account}
              onChange={e => setAccount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
            />
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={load} disabled={loading}>
              {loading ? '…' : 'Load'}
            </button>
          </div>
          <button className={s.iconBtn} onClick={() => setPanelOpen(true)} aria-label="Styling" title="Styling & skins">🎨</button>
        </header>

        <main className={s.content}>
          {error && <p className={s.err}>⚠ {error}</p>}
          {loaded && !error && <p className={s.ok}>Showing live on-chain data for <b>{loaded}</b></p>}
          {current.render({ holdings, planets, account: loaded })}
        </main>
      </div>

      {panelOpen && (
        <StylingPanel
          skinId={skinId}
          vars={vars}
          setToken={setToken}
          applySkin={applySkin}
          reset={reset}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
