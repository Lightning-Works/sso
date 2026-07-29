'use client'

/**
 * Alien Worlds Wallet (AWW) — framework preview.
 *
 * Self-contained testing page for the AWW fork. Every feature section renders
 * so the full framework is visible at a glance; the READ sections (balances,
 * syndicates, NFTs) fill with real on-chain data when a WAX account is loaded,
 * reusing the existing SSO endpoints (/api/wax-holdings, /api/planet). The
 * WRITE/action sections (stake, vote, teleport, comics, assistant) are labeled
 * phase-stubs pending the fork build. Fully additive — touches no other route.
 *
 * Deployed as a Vercel PREVIEW (branch aww-preview) so production login on
 * sso.lightningworks.io is never affected.
 */

import { useCallback, useEffect, useState } from 'react'

// ---- Shapes returned by the existing SSO endpoints ----
type Token = { symbol: string; contract: string | null; amount: number; decimals: number; planet?: string }
type NftGroup = { collection: string; schema: string; template_id: number; count: number }
type Holdings = { account: string; tokens: Token[]; nfts: NftGroup[] }
type Custodian = { name: string; totalVotePower: string; numVoters: number; requestedPay: string; rank: number }
type Candidate = { name: string; totalVotePower: string; numVoters: number; requestedPay: string }
type Planet = {
  planet: string; symbol: string; scope: string
  custodians: Custodian[]; candidates: Candidate[]
  numElected: number; maxVotes: number
  totalSupply: string; maxSupply: string
  proposalBudget: string; spendingsBudget: string
  stakingEnabled: boolean
}

const PLANET_COLORS: Record<string, string> = {
  Magor: '#ff5a3c', Eyeke: '#28c76f', Kavian: '#c774f0',
  Naron: '#4d9dff', Neri: '#ffd23c', Veles: '#ff4d97',
}

const PHASES: Record<string, string> = {
  stake: 'Phase 1', vote: 'Phase 2', teleport: 'Phase 3', comics: 'Phase 4', assistant: 'kept',
}

export default function AwwPreview() {
  const [account, setAccount] = useState('')
  const [loaded, setLoaded] = useState('')
  const [holdings, setHoldings] = useState<Holdings | null>(null)
  const [planets, setPlanets] = useState<Planet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Planet DAO data is account-independent — load it once on mount.
  useEffect(() => {
    Promise.all(
      [0, 1, 2, 3, 4, 5].map(i => fetch(`/api/planet?index=${i}`).then(r => (r.ok ? r.json() : null)).catch(() => null)),
    ).then(res => setPlanets(res.filter(Boolean) as Planet[]))
  }, [])

  const load = useCallback(async () => {
    const acct = account.trim().toLowerCase()
    if (!acct) return
    setLoading(true); setError(''); setHoldings(null)
    try {
      const r = await fetch(`/api/wax-holdings?account=${encodeURIComponent(acct)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'failed to load holdings')
      setHoldings(data); setLoaded(acct)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }, [account])

  const baseTokens = holdings?.tokens.filter(t => !t.planet) ?? []
  const planetTokens = holdings?.tokens.filter(t => t.planet) ?? []
  const nftTotal = holdings?.nfts.reduce((s, n) => s + n.count, 0) ?? 0

  return (
    <div style={S.page}>
      <style>{GLOBAL}</style>

      {/* Header */}
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Alien Worlds Wallet</h1>
          <p style={S.tagline}>All-in-one · WAX + Binance · staking · syndicates · teleport · NFTs</p>
        </div>
        <span style={S.badge}>PREVIEW · framework</span>
      </header>

      {/* Account loader */}
      <section style={S.loader}>
        <input
          style={S.input}
          placeholder="Enter a WAX account (e.g. yourname.wam) to load real holdings"
          value={account}
          onChange={e => setAccount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load() }}
        />
        <button style={S.btn} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load'}</button>
        <button style={{ ...S.btn, ...S.btnGhost }} disabled title="Phase 0">Connect WAX Cloud Wallet</button>
      </section>
      {error && <p style={S.err}>⚠ {error}</p>}
      {loaded && !error && <p style={S.ok}>Showing on-chain data for <b>{loaded}</b></p>}

      {/* Balances */}
      <Card title="Balances" tag="live read">
        {!holdings ? <Empty text="Load an account to see WAX, TLM and planet-token balances." /> : (
          <div style={S.grid}>
            {baseTokens.map(t => <Stat key={t.symbol} label={t.symbol} value={fmt(t.amount)} />)}
            {planetTokens.length === 0 && <Empty text="No planet tokens held." />}
            {planetTokens.map(t => (
              <Stat key={t.symbol} label={`${t.planet} (${t.symbol})`} value={fmt(t.amount)}
                color={PLANET_COLORS[t.planet || ''] || '#8ab4ff'} />
            ))}
          </div>
        )}
      </Card>

      {/* Syndicates / Planets */}
      <Card title="Syndicates — Planetary DAOs" tag="live read">
        {planets.length === 0 ? <Empty text="Loading planet DAOs…" /> : (
          <div style={S.grid}>
            {planets.map(p => (
              <div key={p.symbol} style={{ ...S.planet, borderColor: PLANET_COLORS[p.planet] || '#333' }}>
                <div style={{ ...S.planetName, color: PLANET_COLORS[p.planet] || '#fff' }}>{p.planet}</div>
                <div style={S.planetRow}>{p.custodians.length}/{p.numElected} custodians</div>
                <div style={S.planetRow}>{p.candidates.length} candidates</div>
                <div style={S.planetRow}>Top: {p.candidates[0]?.name || p.custodians[0]?.name || '—'}</div>
                <div style={S.planetRow}>Budget: {p.proposalBudget}</div>
                <div style={S.planetRow}>Staking: {p.stakingEnabled ? '✓ open' : '✗'}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Stake & Convert (stub) */}
      <Card title="Stake & Convert" tag={PHASES.stake}>
        <Stub lines={[
          'Convert TLM ⇄ planet token (1:1, reversible).',
          'Stake / unstake to a planet for daily TLM rewards + voting weight.',
          'Needs the WAX transaction signer (added in the fork).',
        ]} />
      </Card>

      {/* Vote & Candidacy (stub) */}
      <Card title="Vote & Candidacy" tag={PHASES.vote}>
        <Stub lines={[
          'Cast / refresh up to 2 custodian votes per planet, weekly.',
          'Register as a candidate (5,000-TLM path).',
          'Candidate lists above are already read live from dao.worlds.',
        ]} />
      </Card>

      {/* Teleporter (stub) */}
      <Card title="Teleporter — WAX ⇄ Binance" tag={`${PHASES.teleport} · prototype-gated`}>
        <Stub lines={[
          'Move TLM between WAX and BSC (min 100 TLM).',
          'WAX-side send + BSC-side claim via Metamask + oracle proof.',
          'Highest-risk piece — prototyped against AW oracle before launch.',
        ]} />
      </Card>

      {/* NFTs */}
      <Card title={`Alien Worlds NFTs${nftTotal ? ` — ${nftTotal}` : ''}`} tag="live read">
        {!holdings ? <Empty text="Load an account to see land, tools, avatars and more." /> : (
          holdings.nfts.length === 0 ? <Empty text="No Alien Worlds NFTs held." /> : (
            <div style={S.grid}>
              {holdings.nfts.slice(0, 24).map((n, i) => (
                <div key={i} style={S.nft}>
                  <div style={S.nftSchema}>{n.schema}</div>
                  <div style={S.nftMeta}>#{n.template_id} · ×{n.count}</div>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      {/* Comics (stub) */}
      <Card title="Comics" tag={PHASES.comics}>
        <Stub lines={[
          'Alien Worlds comic NFTs — own the NFT, unlock the reader.',
          'Both page-flip and webtoon vertical-scroll formats.',
          'Reader stack carried over from the SSO fork.',
        ]} />
      </Card>

      {/* AI Assistant (stub) */}
      <Card title="AI Assistant" tag={PHASES.assistant}>
        <Stub lines={[
          'Built-in AI character (rebranded from the SSO chat embed).',
          'Kept as a distinctive AWW feature.',
        ]} />
      </Card>

      <footer style={S.footer}>
        AWW framework preview · reads live WAX chain data via existing SSO endpoints · see docs/SCOPE.md
      </footer>
    </div>
  )
}

// ---- small presentational helpers ----
function Card({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  const live = tag.includes('read')
  return (
    <section style={S.card}>
      <div style={S.cardHead}>
        <h2 style={S.h2}>{title}</h2>
        <span style={{ ...S.tag, ...(live ? S.tagLive : S.tagStub) }}>{tag}</span>
      </div>
      {children}
    </section>
  )
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.stat}>
      <div style={S.statVal} title={value}>{value}</div>
      <div style={{ ...S.statLabel, color: color || '#9aa4b2' }}>{label}</div>
    </div>
  )
}
function Stub({ lines }: { lines: string[] }) {
  return <ul style={S.stub}>{lines.map((l, i) => <li key={i} style={S.stubLi}>{l}</li>)}</ul>
}
function Empty({ text }: { text: string }) { return <p style={S.empty}>{text}</p> }

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

const GLOBAL = `
  .aww-reset { box-sizing: border-box; }
  @keyframes awwPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
`

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px 80px', color: '#e7ecf3', fontFamily: 'Inter, system-ui, sans-serif', background: 'radial-gradient(1200px 600px at 50% -10%, #1a2340 0%, #0a0e1a 55%)', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 },
  h1: { fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(90deg,#8ab4ff,#c774f0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  tagline: { margin: '6px 0 0', color: '#8b96a8', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#ffd23c', border: '1px solid #4a4326', background: 'rgba(255,210,60,0.08)', padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap' },
  loader: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  input: { flex: '1 1 320px', minWidth: 240, padding: '11px 14px', borderRadius: 8, border: '1px solid #2a3550', background: '#0e1424', color: '#e7ecf3', fontSize: 14 },
  btn: { padding: '11px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg,#4d9dff,#6a7bff)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnGhost: { background: 'transparent', border: '1px solid #2a3550', color: '#8b96a8', cursor: 'not-allowed' },
  err: { color: '#ff6b6b', fontSize: 13, margin: '4px 0' },
  ok: { color: '#28c76f', fontSize: 13, margin: '4px 0' },
  card: { border: '1px solid #1e2740', background: 'rgba(14,20,36,0.6)', borderRadius: 14, padding: 18, marginTop: 16 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  h2: { fontSize: 17, fontWeight: 700, margin: 0 },
  tag: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 20 },
  tagLive: { color: '#28c76f', background: 'rgba(40,199,111,0.12)', border: '1px solid rgba(40,199,111,0.3)' },
  tagStub: { color: '#8b96a8', background: 'rgba(139,150,168,0.1)', border: '1px solid rgba(139,150,168,0.25)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 },
  stat: { border: '1px solid #1e2740', borderRadius: 10, padding: '12px 14px', background: '#0b101d' },
  statVal: { fontSize: 20, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statLabel: { fontSize: 12, marginTop: 3 },
  planet: { border: '1px solid', borderRadius: 10, padding: '12px 14px', background: '#0b101d' },
  planetName: { fontSize: 16, fontWeight: 800, marginBottom: 6 },
  planetRow: { fontSize: 12, color: '#9aa4b2', lineHeight: 1.7 },
  nft: { border: '1px solid #1e2740', borderRadius: 10, padding: '12px 14px', background: '#0b101d' },
  nftSchema: { fontSize: 13, fontWeight: 700, textTransform: 'capitalize' },
  nftMeta: { fontSize: 11, color: '#8b96a8', marginTop: 4 },
  stub: { margin: 0, paddingLeft: 18, color: '#9aa4b2' },
  stubLi: { fontSize: 13, lineHeight: 1.9 },
  empty: { color: '#6b7688', fontSize: 13, margin: 0 },
  footer: { marginTop: 30, textAlign: 'center', color: '#5b6578', fontSize: 12 },
}
