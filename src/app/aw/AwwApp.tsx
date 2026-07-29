'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import s from './aw.module.css'
import { NAV, FIRST, type NavGroup, type NavChild } from './nav'
import { useTheme } from './theme/useTheme'
import { StylingPanel } from './theme/StylingPanel'
import { fetchHoldings, fetchPlanets, type Holdings, type Planet } from './lib/waxData'

const groupOf = (childId: string): NavGroup =>
  NAV.find(g => g.children.some(c => c.id === childId)) ?? NAV[0]

export default function AwwApp() {
  const { skinId, vars, setToken, applySkin, reset } = useTheme()

  const [active, setActive] = useState(FIRST)
  const [expanded, setExpanded] = useState<Set<string>>(new Set([groupOf(FIRST).id]))
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

  const onGroup = (g: NavGroup) => {
    const isOpen = expanded.has(g.id)
    const next = new Set(expanded)
    if (isOpen) { next.delete(g.id) } else { next.add(g.id); setActive(g.children[0].id) }
    setExpanded(next)
  }
  const onChild = (c: NavChild, gid: string) => {
    setActive(c.id)
    if (!expanded.has(gid)) setExpanded(new Set(expanded).add(gid))
    setNavOpen(false)
  }

  const activeGroup = groupOf(active)
  const activeChild = activeGroup.children.find(c => c.id === active) ?? activeGroup.children[0]

  return (
    <div className={s.app} style={vars as unknown as CSSProperties}>
      {/* Sidebar outline */}
      <aside className={`${s.sidebar} ${navOpen ? s.sidebarOpen : ''}`}>
        <div className={s.brand}>
          <div className={s.brandMark}>🌌</div>
          <div>
            <div className={s.brandName}>Alien Worlds</div>
            <div className={s.brandSub}>WALLET</div>
          </div>
        </div>

        {NAV.map(g => {
          const open = expanded.has(g.id)
          return (
            <div key={g.id}>
              <button
                className={`${s.navItem} ${activeGroup.id === g.id ? s.navItemActive : ''}`}
                onClick={() => onGroup(g)}
              >
                <span className={s.navIcon}>{g.icon}</span>
                <span className={s.navFill}>{g.label}</span>
                <span className={`${s.chev} ${open ? s.chevOpen : ''}`}>›</span>
              </button>
              {open && (
                <div className={s.children}>
                  {g.children.map(c => (
                    <button
                      key={c.id}
                      className={`${s.child} ${active === c.id ? s.childActive : ''}`}
                      onClick={() => onChild(c, g.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className={s.navSpacer} />
        <div className={s.navFoot}>Preview build · live WAX data</div>
      </aside>

      {/* Main */}
      <div className={s.main}>
        <header className={s.topbar}>
          <button className={`${s.iconBtn} ${s.hamburger}`} onClick={() => setNavOpen(o => !o)} aria-label="Menu">☰</button>
          <span className={s.crumb}>
            <span className={s.crumbGroup}>{activeGroup.label}</span>
            <span className={s.crumbSep}>›</span>
            {activeChild.label}
          </span>
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
          {activeChild.render({ holdings, planets, account: loaded })}
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
