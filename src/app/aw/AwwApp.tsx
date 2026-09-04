'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import s from './aw.module.css'
import { NAV, FIRST, pathForChild, childForPath, type NavGroup, type NavChild } from './nav'

// URL segments after "/aw" — e.g. "/aw/syndicates/kavian" → ['syndicates','kavian'].
const segsOf = (p: string) => (p || '').replace(/^\/aw\/?/, '').split('/').filter(Boolean)
import { useTheme } from './theme/useTheme'
import { lwVarsFrom } from './theme/tokens'
import { StylingPanel } from './theme/StylingPanel'
import { Icon } from './ui/Icon'
import { LoginGate } from './ui/LoginGate'
import { fetchHoldings, fetchPlanets, type Holdings, type Planet } from './lib/waxData'
import { useSessionWax } from './lib/aw/useSessionWax'
import { connectWax, autoLoginWax, rememberedAccount } from '@/lib/wallets/waxSession'

const groupOf = (childId: string): NavGroup =>
  NAV.find(g => g.children.some(c => c.id === childId)) ?? NAV[0]

// Starblind Metaverse game (in build by a separate agent). Embedded as a
// fullscreen iframe. Set the real URL here (or via NEXT_PUBLIC_METAVERSE_URL)
// once the game's host is ready — see docs/METAVERSE_EMBED_SPEC.md.
// Starblink, the hex land world. Its own app on its own origin (repo: geoff/starblink), which
// serves `Content-Security-Policy: frame-ancestors https://sso.lightningworks.io http://localhost:3000`
// and no X-Frame-Options, so it may be framed from here.
// NOTE the spelling: Starblink, not Starblind. Starblind is a different Lightning Works site.
const METAVERSE_URL = process.env.NEXT_PUBLIC_METAVERSE_URL || 'https://starblink.pages.dev'
const METAVERSE_ORIGIN = (() => { try { return new URL(METAVERSE_URL).origin } catch { return '' } })()

export default function AwwApp() {
  const { skinId, vars, setToken, applySkin, reset, importVars } = useTheme()

  // Initial page comes from the URL (deep links like /aw/syndicates/kavian).
  const pathname = usePathname()
  const initialId = childForPath(segsOf(pathname || '/aw'))
  const [active, setActive] = useState(initialId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set([groupOf(initialId).id]))
  const [account, setAccount] = useState('')
  const [loaded, setLoaded] = useState('')
  const [holdings, setHoldings] = useState<Holdings | null>(null)
  const [planets, setPlanets] = useState<Planet[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [metaverseOpen, setMetaverseOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [isFrame, setIsFrame] = useState(false)
  const [isSuper, setIsSuper] = useState(false)
  const session = useSessionWax()
  const autoLoaded = useRef(false)
  const beaconed = useRef(false)
  const metaFrame = useRef<HTMLIFrameElement>(null)

  // Hand the player's identity to the Metaverse game over postMessage (never in
  // the URL — email is personal). Only ever posted to the game's exact origin.
  const sendMetaverseIdentity = useCallback(() => {
    if (!METAVERSE_ORIGIN) return
    try {
      metaFrame.current?.contentWindow?.postMessage(
        { type: 'lw-identity', app: 'alien-worlds-wallet', wax: loaded || null, email: session.email || null },
        METAVERSE_ORIGIN,
      )
    } catch { /* ignore */ }
  }, [loaded, session.email])

  // The game can ask for identity, or ask us to close the overlay.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!METAVERSE_ORIGIN || e.origin !== METAVERSE_ORIGIN) return
      const t = (e.data as { type?: string })?.type
      if (t === 'lw-close') setMetaverseOpen(false)
      else if (t === 'lw-request-identity') sendMetaverseIdentity()
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [sendMetaverseIdentity])

  useEffect(() => { fetchPlanets().then(setPlanets).catch(() => setPlanets([])) }, [])
  // Auto-load the logged-in SSO user's linked WAX account (their NFTs/WAX/TLM).
  useEffect(() => {
    if (session.wax && !autoLoaded.current && !loaded && !account.trim()) {
      autoLoaded.current = true
      setAccount(session.wax)
      setLoaded(session.wax)
      fetchHoldings(session.wax).then(setHoldings).catch(() => {})
    }
  }, [session.wax, loaded, account])
  useEffect(() => { try { setIsFrame(new URLSearchParams(window.location.search).get('frame') === '1') } catch { /* ignore */ } }, [])
  // Is this the Mining Data superadmin? Gates the Admin nav group.
  useEffect(() => {
    if (!session.email) { setIsSuper(false); return }
    fetch('/api/aw/superadmin', { cache: 'no-store' }).then(r => r.json()).then(j => setIsSuper(!!j.superadmin)).catch(() => setIsSuper(false))
  }, [session.email])
  // Log this visitor for the admin node map (best-effort, once per load).
  useEffect(() => {
    if (beaconed.current || session.loading) return
    beaconed.current = true
    fetch('/api/aw/beacon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wax: session.wax || undefined }) }).catch(() => {})
  }, [session.loading, session.wax])
  // Silently restore a live WAX Cloud Wallet connection after a refresh (no
  // popup) so the user stays connected and can sign without reconnecting.
  useEffect(() => {
    autoLoginWax().then(a => {
      if (autoLoaded.current) return
      // Live session if available; otherwise the remembered account for
      // read-only viewing (balances/NFTs) without a wallet popup.
      const acct = a || rememberedAccount()
      if (acct) {
        autoLoaded.current = true
        setAccount(acct); setLoaded(acct)
        fetchHoldings(acct).then(setHoldings).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const groups = NAV.filter(g => {
    if (g.id === 'device' && isFrame) return false
    if (g.id === 'admin' && !isSuper) return false
    return true
  })

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

  // Connect the WAX Cloud Wallet (popup), then load that account.
  const connectWallet = useCallback(async () => {
    setConnecting(true); setError('')
    try {
      const acct = await connectWax()
      if (!acct) { setError('Wallet connect was cancelled'); return }
      setAccount(acct); setLoaded(acct)
      const data = await fetchHoldings(acct)
      setHoldings(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'wallet connect failed')
    } finally {
      setConnecting(false)
    }
  }, [])

  // Navigate to a nav child: update the page, expand its group, close the mobile
  // drawer, and push a human-readable URL — WITHOUT a Next navigation, so the
  // SPA shell (session, holdings, wallet connection) is preserved.
  const setRoute = useCallback((childId: string) => {
    setActive(childId)
    setExpanded(prev => new Set(prev).add(groupOf(childId).id))
    setNavOpen(false)
    const url = pathForChild(childId)
    if (typeof window !== 'undefined' && window.location.pathname !== url) {
      window.history.pushState(null, '', url)
    }
  }, [])

  // Keep in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const id = childForPath(segsOf(window.location.pathname))
      setActive(id)
      setExpanded(prev => new Set(prev).add(groupOf(id).id))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const onGroup = (g: NavGroup) => {
    if (expanded.has(g.id)) {
      setExpanded(prev => { const n = new Set(prev); n.delete(g.id); return n })
    } else {
      setRoute(g.children[0].id)
    }
  }
  const onChild = (c: NavChild) => setRoute(c.id)
  const goTo = (childId: string) => setRoute(childId)

  const activeGroup = groupOf(active)
  const activeChild = activeGroup.children.find(c => c.id === active) ?? activeGroup.children[0]
  const styleVars = { ...vars, ...lwVarsFrom(vars) } as unknown as CSSProperties

  if (session.loading) return <div className={s.shell} style={styleVars} />
  if (!session.email) return <div className={s.shell} style={styleVars}><LoginGate /></div>

  return (
    <div className={s.shell} style={styleVars}>
    <div className={s.stars1} aria-hidden />
    <div className={s.stars2} aria-hidden />
    <div className={s.stars3} aria-hidden />
    <div className={s.app}>
      {/* Sidebar outline */}
      <aside className={`${s.sidebar} ${navOpen ? s.sidebarOpen : ''}`}>
        <div className={s.brand}>
          <img src="/aww/aw-logo.webp" alt="Alien Worlds Community" className={s.brandLogo} />
        </div>
        <button className={s.metaverseBtn} onClick={() => setMetaverseOpen(true)} title="Enter the Starblind Metaverse">
          ENTER THE METAVERSE
        </button>

        {groups.map(g => {
          const open = expanded.has(g.id)
          // Single-purpose groups (e.g. the Bridge) act as a direct link — no
          // chevron, no redundant sub-item.
          if (g.directLink) {
            return (
              <div key={g.id}>
                <button
                  className={`${s.navItem} ${activeGroup.id === g.id ? s.navItemActive : ''}`}
                  onClick={() => setRoute(g.children[0].id)}
                >
                  <span className={s.navIcon}><Icon name={g.icon} /></span>
                  <span className={s.navFill}>{g.label}</span>
                </button>
              </div>
            )
          }
          return (
            <div key={g.id}>
              <button
                className={`${s.navItem} ${activeGroup.id === g.id ? s.navItemActive : ''}`}
                onClick={() => onGroup(g)}
              >
                <span className={s.navIcon}><Icon name={g.icon} /></span>
                <span className={s.navFill}>{g.label}</span>
                <span className={`${s.chev} ${open ? s.chevOpen : ''}`}>›</span>
              </button>
              {open && (
                <div className={s.children}>
                  {g.children.map(c => (
                    <button
                      key={c.id}
                      className={`${s.child} ${active === c.id ? s.childActive : ''}`}
                      onClick={() => onChild(c)}
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
          <button className={`${s.iconBtn} ${s.hamburger}`} onClick={() => setNavOpen(o => !o)} aria-label="Menu"><Icon name="menu" /></button>
          <span className={s.crumb}>
            <span className={s.crumbGroup}>{activeGroup.label}</span>
            <span className={s.crumbSep}>›</span>
            {activeChild.label}
          </span>
          <div className={s.grow} />
          {!session.loading && (session.email
            ? <span style={{ fontSize: 12, color: 'var(--aww-text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={`Signed in as ${session.email}`}>
                {session.wax ? `Signed in · ${session.wax}` : 'Signed in · no WAX linked'}
              </span>
            : <a href="/login" style={{ fontSize: 12, color: 'var(--aww-primary)', whiteSpace: 'nowrap', textDecoration: 'none' }}>Log in →</a>)}
          <div className={s.account}>
            <span className={`${s.dot} ${loaded ? '' : s.dotOff}`} />
            <input
              className={s.acctInput}
              placeholder="WAX account — or Connect →"
              value={account}
              onChange={e => setAccount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
            />
            <button
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={() => (account.trim() ? load() : connectWallet())}
              disabled={loading || connecting}
            >
              {loading || connecting ? '…' : account.trim() ? 'Load' : 'Connect'}
            </button>
          </div>
          <button className={s.iconBtn} onClick={() => setPanelOpen(true)} aria-label="Styling" title="Styling & skins"><Icon name="gear" /></button>
        </header>

        <main className={s.content}>
          {error && <p className={s.err}>⚠ {error}</p>}
          {loaded && !error && <p className={s.ok}>Showing live on-chain data for <b>{loaded}</b></p>}
          {activeChild.render({ holdings, planets, account: loaded, navigate: goTo })}
        </main>
      </div>

      </div>

      {metaverseOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#05030f', display: 'flex', flexDirection: 'column' }}>
          <button
            onClick={() => setMetaverseOpen(false)}
            style={{ position: 'absolute', top: 12, right: 14, zIndex: 2, background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ✕ Close
          </button>
          <iframe
            ref={metaFrame}
            src={METAVERSE_URL}
            title="Starblind Metaverse"
            allow="fullscreen; gamepad; microphone; autoplay; xr-spatial-tracking; clipboard-write; pointer-lock"
            onLoad={sendMetaverseIdentity}
            style={{ flex: 1, width: '100%', border: 'none', display: 'block' }}
          />
        </div>
      )}

      {panelOpen && (
        <StylingPanel
          skinId={skinId}
          vars={vars}
          setToken={setToken}
          applySkin={applySkin}
          reset={reset}
          importVars={importVars}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
