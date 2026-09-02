'use client'

/**
 * Teleporter — move Trilium across chains via the live Alien Worlds bridge
 * (other.worlds). Phase 1: the WAX→Binance send is signed natively here (deposit
 * + teleport in one Cloud Wallet transaction); the Binance-side claim is handed
 * off to teleport.alienworlds.io (needs MetaMask + BNB). Binance→WAX and in-app
 * claiming arrive in later phases using our EVM wallet.
 */
import { useState } from 'react'
import s from '../aw.module.css'
import { PageHead, Card } from '../ui/primitives'
import { currentAccount, connectWax, transact } from '@/lib/wallets/waxSession'
import { buildTeleportActions, isEvmAddress, MIN_TLM, CLAIM_URL } from '../lib/aw/teleport'
import type { FeatureProps } from './ctx'

const PRIMARY = 'var(--aww-primary, #b06cff)'
const MUTED = 'var(--aww-text-muted, #9aa)'

function WaxToBinance({ account }: { account: string }) {
  const [addr, setAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<{ kind: 'working' | 'ok' | 'err'; msg: string } | null>(null)
  const [done, setDone] = useState(false)

  const amt = parseFloat(amount)
  const addrOk = isEvmAddress(addr)
  const amtOk = Number.isFinite(amt) && amt >= MIN_TLM
  const canSend = addrOk && amtOk && !status

  const send = async () => {
    if (!canSend) return
    setStatus({ kind: 'working', msg: 'Confirm in your wallet…' })
    try {
      if (!currentAccount()) await connectWax()
      const acct = currentAccount() || account
      const res = await transact(buildTeleportActions(acct, amt, addr))
      const tx = String(res.transaction_id || '').slice(0, 8)
      setStatus({ kind: 'ok', msg: `Sent from WAX${tx ? ` (tx ${tx}…)` : ''}. Now claim it on Binance.` })
      setDone(true)
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Teleport failed' })
    }
  }

  const label = { display: 'block', fontSize: 12, color: MUTED, margin: '10px 0 4px' }
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 14,
    background: 'color-mix(in srgb, var(--aww-text-muted) 8%, transparent)',
    border: '1px solid color-mix(in srgb, var(--aww-text-muted) 25%, transparent)', color: 'var(--aww-text)',
  }

  return (
    <Card title="WAX → Binance">
      <p className={s.empty} style={{ marginTop: 0 }}>
        Send Trilium from WAX to Binance Smart Chain through the Alien Worlds bridge. The WAX side is signed here; you finish by claiming on Binance (MetaMask + a little BNB for gas).
      </p>

      <label style={label}>Your Binance (BSC) address</label>
      <input style={{ ...input, borderColor: addr && !addrOk ? '#ff6b6b' : (input.border as string) }}
        placeholder="0x…" value={addr} onChange={e => setAddr(e.target.value)} spellCheck={false} />
      {addr && !addrOk && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 4 }}>That doesn’t look like a 0x… BSC address.</div>}

      <label style={label}>Amount</label>
      <div style={{ position: 'relative' }}>
        <input style={input} placeholder={`Min ${MIN_TLM}`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        <span style={{ position: 'absolute', right: 11, top: 10, fontSize: 13, color: MUTED }}>$TLM</span>
      </div>
      {amount && !amtOk && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 4 }}>Minimum is {MIN_TLM} $TLM.</div>}

      <div style={{ fontSize: 11, color: MUTED, margin: '10px 0 12px' }}>
        A small bridge fee is deducted by the oracles on the Binance side, so the amount you claim is slightly less.
      </div>

      <button onClick={send} disabled={!canSend}
        style={{
          width: '100%', padding: '11px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 14, color: '#fff',
          cursor: canSend ? 'pointer' : 'default',
          background: canSend ? `linear-gradient(135deg, ${PRIMARY}, color-mix(in srgb, ${PRIMARY} 60%, #4be1c2))` : 'color-mix(in srgb, var(--aww-text-muted) 30%, transparent)',
        }}>
        {status?.kind === 'working' ? 'Working…' : 'Teleport to Binance'}
      </button>

      {status && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.4, color: status.kind === 'err' ? '#ff6b6b' : status.kind === 'ok' ? '#4be1c2' : MUTED }}>
          {status.msg}
        </div>
      )}

      {done && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'color-mix(in srgb, var(--aww-primary, #b06cff) 12%, transparent)', border: `1px solid color-mix(in srgb, ${PRIMARY} 30%, transparent)` }}>
          <div style={{ fontSize: 13, color: 'var(--aww-text)', fontWeight: 700, marginBottom: 6 }}>Last step — claim on Binance</div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
            Open the Alien Worlds teleport page, connect the same Binance address ({addr.slice(0, 6)}…{addr.slice(-4)}) with MetaMask, and claim your Trilium. It appears once the oracles have signed (usually a few minutes).
          </div>
          <a href={CLAIM_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: 'color-mix(in srgb, var(--aww-primary, #b06cff) 50%, #fff)', textDecoration: 'none' }}>
            Claim on Binance ↗
          </a>
        </div>
      )}
    </Card>
  )
}

export default function Teleporter({ account }: FeatureProps) {
  return (
    <>
      <PageHead title="Teleporter" desc="Move Trilium between WAX and Binance through the Alien Worlds bridge." />

      {account
        ? <WaxToBinance account={account} />
        : <Card title="WAX → Binance"><p className={s.empty} style={{ marginTop: 0 }}>Load or connect a WAX account to teleport Trilium to Binance.</p></Card>}

      <Card title="Binance → WAX" tag="Phase 3">
        <ul className={s.stub}><li>Bring Trilium back from Binance to WAX. Needs the in-app Binance (EVM) wallet — coming next, reusing our existing EVM wallet code.</li></ul>
      </Card>
      <Card title="History" tag="Phase 4">
        <ul className={s.stub}><li>Your past teleports and their claim status, read from the bridge contract.</li></ul>
      </Card>
    </>
  )
}
