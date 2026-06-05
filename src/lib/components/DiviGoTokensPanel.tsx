'use client'

/**
 * DiviGoTokensPanel — superadmin UI to register custom ERC-20 tokens for the
 * EVM chains DiviGo runs on. Writes require the caller's email to be on the
 * server-side allowlist (DIVIGO_TOKEN_ADMIN_EMAILS); the API returns
 * `canWrite` so we can show a read-only banner instead of a dead form.
 *
 * A registered token can't be sent/pooled by DiviGo until their backend adds
 * it (see docs/DIVIGO-ERC20-TOKEN-REPORT.md) — the panel says so plainly and
 * keeps `send_enabled` off by default.
 */

import { useCallback, useEffect, useState } from 'react'
import { DIVIGO_ERC20_CHAINS, DIVIGO_ERC20_CHAIN_KEYS, type CustomToken } from '@/lib/divigo/tokens'

const PANEL_BG = '#181818'
const FIELD_BG = '#0f0f0f'
const BORDER = '1px solid rgba(255,255,255,0.08)'

const EMPTY = {
  chain: 'ethereum',
  contract_address: '',
  symbol: '',
  name: '',
  decimals: '18',
  divigo_slug: '',
  logo_url: '',
  send_enabled: false,
}

function field(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: FIELD_BG, border: BORDER, borderRadius: 6,
    color: 'var(--lw-text-white)', padding: '0.5rem 0.65rem',
    fontSize: '0.85rem', width: '100%', ...extra,
  }
}

export function DiviGoTokensPanel() {
  const [tokens, setTokens] = useState<CustomToken[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/divigo-tokens', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) { setTokens(j.tokens || []); setCanWrite(!!j.canWrite) }
      else setMsg({ text: j.error || `HTTP ${r.status}`, ok: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/divigo-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, decimals: Number(form.decimals) }),
      })
      const j = await r.json()
      if (r.ok) { setMsg({ text: 'Token saved.', ok: true }); setForm({ ...EMPTY }); load() }
      else setMsg({ text: j.error || `HTTP ${r.status}`, ok: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
    setBusy(false)
  }

  const remove = async (id: string, symbol: string) => {
    if (!confirm(`Remove ${symbol}? This only affects the SSO registry.`)) return
    setMsg(null)
    try {
      const r = await fetch(`/api/admin/divigo-tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await r.json()
      if (r.ok) load()
      else setMsg({ text: j.error || `HTTP ${r.status}`, ok: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  const toggle = async (t: CustomToken, key: 'enabled' | 'send_enabled') => {
    try {
      const r = await fetch('/api/admin/divigo-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...t, [key]: !t[key] }),
      })
      if (r.ok) load()
      else { const j = await r.json(); setMsg({ text: j.error || `HTTP ${r.status}`, ok: false }) }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  const chainNote = DIVIGO_ERC20_CHAINS[form.chain]?.divigoNativeSlug === null
    ? 'DiviGo has no EVM provider for this chain yet (it runs BEP-2, not BSC). Registering is fine, but sends/balances need backend work first.'
    : null

  return (
    <div>
      <p style={{ color: 'var(--lw-text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
        Register ERC-20 tokens for DiviGo&apos;s EVM chains. This is the SSO-side registry only —
        DiviGo hardcodes its token list and has no API to add one, so a registered token can&apos;t be
        pooled or sent by DiviGo until their backend ships support. Keep <strong>Send</strong> off until then.
        Details in <code>docs/DIVIGO-ERC20-TOKEN-REPORT.md</code>.
      </p>

      {!canWrite && (
        <div style={{ background: 'rgba(240,184,90,0.1)', border: '1px solid rgba(240,184,90,0.35)', borderRadius: 6, padding: '0.65rem 0.8rem', color: '#f0b85a', fontSize: '0.82rem', marginBottom: '1rem' }}>
          Read-only — your account isn&apos;t on the token-admin allowlist (DIVIGO_TOKEN_ADMIN_EMAILS).
        </div>
      )}

      {msg && (
        <div style={{ background: msg.ok ? 'rgba(46,160,67,0.12)' : 'rgba(248,81,73,0.12)', border: `1px solid ${msg.ok ? 'rgba(46,160,67,0.4)' : 'rgba(248,81,73,0.4)'}`, borderRadius: 6, padding: '0.6rem 0.8rem', color: msg.ok ? '#2ea043' : '#f85149', fontSize: '0.82rem', marginBottom: '1rem' }}>
          {msg.text}
        </div>
      )}

      {canWrite && (
        <div style={{ background: PANEL_BG, border: BORDER, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              Chain
              <select value={form.chain} onChange={e => setForm({ ...form, chain: e.target.value })} style={field({ marginTop: 4 })}>
                {DIVIGO_ERC20_CHAIN_KEYS.map(k => <option key={k} value={k}>{DIVIGO_ERC20_CHAINS[k].label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              Contract address
              <input value={form.contract_address} onChange={e => setForm({ ...form, contract_address: e.target.value })} placeholder="0x…" style={field({ marginTop: 4, fontFamily: 'monospace' })} />
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              Symbol
              <input value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} placeholder="LINK" style={field({ marginTop: 4 })} />
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              Name
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Chainlink" style={field({ marginTop: 4 })} />
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              Decimals
              <input value={form.decimals} onChange={e => setForm({ ...form, decimals: e.target.value })} inputMode="numeric" style={field({ marginTop: 4 })} />
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)' }}>
              DiviGo slug (optional)
              <input value={form.divigo_slug} onChange={e => setForm({ ...form, divigo_slug: e.target.value })} placeholder="set once DiviGo adds it" style={field({ marginTop: 4 })} />
            </label>
            <label style={{ fontSize: '0.78rem', color: 'var(--lw-text-muted)', gridColumn: '1 / -1' }}>
              Logo URL (optional, https)
              <input value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" style={field({ marginTop: 4 })} />
            </label>
          </div>

          {chainNote && (
            <p style={{ color: '#f0b85a', fontSize: '0.78rem', marginTop: '0.75rem', lineHeight: 1.45 }}>⚠ {chainNote}</p>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.85rem', fontSize: '0.82rem', color: 'var(--lw-text-secondary)' }}>
            <input type="checkbox" checked={form.send_enabled} onChange={e => setForm({ ...form, send_enabled: e.target.checked })} />
            Allow sending (only once DiviGo confirms it can send this token)
          </label>

          <button onClick={submit} disabled={busy} style={{ marginTop: '1rem', background: '#2ea043', color: '#fff', border: 'none', borderRadius: 6, padding: '0.55rem 1.1rem', fontSize: '0.85rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Register token'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>Loading…</p>
      ) : tokens.length === 0 ? (
        <p style={{ color: 'var(--lw-text-muted)', fontSize: '0.85rem' }}>No custom tokens registered yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tokens.map(t => (
            <div key={t.id} style={{ background: PANEL_BG, border: BORDER, borderRadius: 8, padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.9rem', opacity: t.enabled ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--lw-text-white)', fontSize: '0.9rem', fontWeight: 600 }}>
                  {t.symbol} <span style={{ color: 'var(--lw-text-muted)', fontWeight: 400 }}>· {t.name}</span>
                </div>
                <div style={{ color: 'var(--lw-text-muted)', fontSize: '0.74rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {DIVIGO_ERC20_CHAINS[t.chain]?.label || t.chain} · {t.contract_address} · {t.decimals}d{t.divigo_slug ? ` · slug:${t.divigo_slug}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: t.send_enabled ? 'rgba(46,160,67,0.15)' : 'rgba(255,255,255,0.06)', color: t.send_enabled ? '#2ea043' : 'var(--lw-text-muted)', border: `1px solid ${t.send_enabled ? 'rgba(46,160,67,0.4)' : 'rgba(255,255,255,0.1)'}`, whiteSpace: 'nowrap' }}>
                {t.send_enabled ? 'send on' : 'receive only'}
              </span>
              {canWrite && (
                <>
                  <button onClick={() => toggle(t, 'send_enabled')} title="Toggle send" style={{ background: 'transparent', border: BORDER, borderRadius: 6, color: 'var(--lw-text-secondary)', padding: '0.35rem 0.6rem', fontSize: '0.74rem', cursor: 'pointer' }}>
                    {t.send_enabled ? 'Disable send' : 'Enable send'}
                  </button>
                  <button onClick={() => toggle(t, 'enabled')} title="Toggle enabled" style={{ background: 'transparent', border: BORDER, borderRadius: 6, color: 'var(--lw-text-secondary)', padding: '0.35rem 0.6rem', fontSize: '0.74rem', cursor: 'pointer' }}>
                    {t.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => remove(t.id, t.symbol)} style={{ background: 'transparent', border: '1px solid rgba(248,81,73,0.4)', borderRadius: 6, color: '#f85149', padding: '0.35rem 0.6rem', fontSize: '0.74rem', cursor: 'pointer' }}>
                    Remove
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
