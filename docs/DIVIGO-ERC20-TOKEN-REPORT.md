# DiviGo ERC-20 token support — what exists, what SSO added, what DiviGo must build

**For:** DiviGo development team
**From:** LightningWorks (geoff@lightningworks.io)
**Date:** 2026-06-05
**Subject:** Enabling admin-registered ERC-20 tokens across DiviGo's EVM chains (Ethereum, Polygon, BSC/Binance, Waterfall), and the API surface DiviGo needs to make it work.

---

## 1. What we wanted

Let a LightningWorks superadmin register **any** ERC-20 token on any EVM chain DiviGo
runs, and have it show up (balance + send) in the SSO DiviGo wallet — without a
code deploy per token.

## 2. What DiviGo actually has today

Findings are from `DiviGoReboot-main/src/coins/blockchain/eth.js` and
`src/coins/src/coins.js` (read statically — the Reboot tree was **not** executed;
it contains the `server.js` backdoor documented in `DIVIGO-MALWARE-REPORT.md`).

**The token list is hardcoded.** `eth.js` holds a literal map:

```js
const ERC20_CONTRACTS = {
  bat:      { address: '0x0d87...87ef', precision: 6 },
  usdc:     { address: '0xa0b8...eb48', precision: 6 },
  usdt:     { address: '0xdac1...1ec7', precision: 6 },
  dividoge: { address: '0x027b...37aa', precision: 18 },
  edivi:    { address: '0x2469...3a77', precision: 8 },
}
```

Key limitations that follow from the code:

1. **No API to add a token.** Nothing in `api.js` accepts a contract address.
   Adding a token = editing `ERC20_CONTRACTS` and redeploying.
2. **ERC-20 is Ethereum-only.** `getContract()` always binds to the module-level
   `provider` (Ethereum mainnet). It *will* accept a raw `0x` address as a fallback
   coin, but it still queries it on Ethereum — there is no per-token chain field.
   So a Polygon/BSC/Waterfall token address would be read against the wrong chain.
3. **ERC-20 is balance-read-only.** `eth.js`'s `tx()` send path only handles the
   **native** coins `eth`, `poly`, `core`. The ERC-20 `transfer()` function is
   declared on the contract ABI but never called by the send pipeline. **DiviGo
   cannot send an ERC-20 token from its pool.**
4. **`balance` with `coin:'all'` only iterates `divi/btc/eth/ltc/doge/core`.**
   Every other coin (and every token) must be queried one slug at a time.

### Per-chain reality

| Chain (our ask) | DiviGo provider | Native coin | ERC-20 tokens |
|---|---|---|---|
| Ethereum | `provider` (ethers) | `eth` — send ✓ | balance ✓ (hardcoded list), **send ✗** |
| Polygon | `providerPoly` | `poly` — send ✓ | **none** (tokens aren't bound to this provider) |
| **Binance** | `binance.js` = **BEP-2** (dex.binance.org SDK) | `bnb` — send ✓ | **✗ — no BSC/EVM provider at all** |
| Waterfall | `providerWaterfall` | `water` — balance ✓, **send ✗** (not in `tx()`) | **none** |

> **Biggest surprise:** DiviGo's "Binance" is the legacy **Binance Chain (BEP-2)**,
> not **BSC (BEP-20)**. There is no BSC JSON-RPC provider in the codebase, so
> BEP-20 ERC-20-style tokens have nowhere to run until DiviGo adds one.

### Exact coin slugs (for reference)

`eth`, `poly`, `core`, `telos`, `water` (← Waterfall, *not* "waterfall"),
`usdc`, `usdt`, `edivi`, `dividoge`, `bat`, `divi`, `btc`, `ltc`, `doge`, `dash`,
`wax`, `tlm`, `bnb`, `fio`.

## 3. What we built on the SSO side now

Everything that's possible without DiviGo changes — a forward-compatible registry:

- **`divigo_custom_tokens` table** (`docs/divigo-custom-tokens-migration.sql`):
  chain, contract address, symbol, name, decimals, optional `divigo_slug`, logo,
  `send_enabled` (default **off**), `enabled`.
- **Admin UI** — a "Tokens" tab in `/admin` to register/enable/remove tokens, with
  per-chain warnings (e.g. it tells you BSC has no DiviGo provider yet).
- **Lockdown** — writes require `superadmin` **and** an email on
  `DIVIGO_TOKEN_ADMIN_EMAILS` (defaults to geoff@lightningworks.io). Reads are
  superadmin-only. Every write is audit-logged. (Email allowlist was chosen over
  an IP allowlist so it survives laptop IP changes / travel / VPN while staying
  just as tight.)
- **Read API** `/api/divigo/tokens` — ready for the wallet to consume the moment
  DiviGo can service tokens.
- **Coin list updates** in the live DiviGo wallet: added **POLY** (sendable),
  surfaced **USDC / USDT / eDIVI / WATER** balances (receive-only, since DiviGo
  can't send them), and **dropped FIO** per request. A hard server-side
  `SENDABLE_COINS` allowlist now blocks forged/unsendable coin slugs from reaching
  DiviGo's (compromised) backend.

**What the registry cannot do until DiviGo ships §4:** show a token's DiviGo pooled
balance, or send it. A registered token is inert on DiviGo's side today — hence
`send_enabled` defaults off.

## 4. What DiviGo needs to add (the ask)

To make API-driven ERC-20 tokens work end-to-end across all four chains:

1. **A token registry with a chain field.** Replace the hardcoded `ERC20_CONTRACTS`
   map with a DB/config table keyed by **(chain, contractAddress)** carrying
   `decimals`, `symbol`, and a stable `slug`. Add an API method
   `addToken({ chain, contractAddress, slug, decimals, symbol })`.
2. **Per-chain ERC-20 binding.** `getContract(coin)` must select the provider for
   the token's chain (eth/poly/bsc/waterfall), not always Ethereum. Add a **BSC
   JSON-RPC provider** (and ideally migrate "Binance" from BEP-2 to BSC, or expose
   both explicitly).
3. **ERC-20 send wiring.** Extend the `tx()`/send path to call the token contract's
   `transfer(to, amount)` (with correct decimals and gas in the chain's native
   coin) for token coins — today it only sends native eth/poly/core.
4. **Native-send gaps.** Wire `water` (Waterfall) — and `telos` if wanted — into
   `tx()`; they currently read balance but can't send.
5. **Extend `balance` `coin:'all'`** to include the registered tokens (or add a
   `coin:'tokens'` mode), so the SSO wallet doesn't need an N+1 per-token call.
6. **Per-token gas/fee handling.** ERC-20 sends need native-coin gas in the pool
   wallet on each chain; `coins.js` fee logic assumes UTXO/native and needs a
   token branch.

Once 1–3 exist, the SSO side needs **zero** new code: an admin sets the token's
`divigo_slug`, flips `send_enabled` on, and the existing wallet flow handles it.

## 5. Solana — does DiviGo have any?

**No. None.** A full static scan of the DiviGo backend (both the 2023
`DiviGo-api-master` tree and the `DiviGoReboot-main` tree):

- No `solana.js` / no `coins/blockchain/sol*` module.
- No `@solana/web3.js`, `@solana/spl-token`, or any `@solana/*` dependency.
- No SPL-token, Phantom, lamport, or `sol` coin-slug references anywhere in
  `src/`. (The only "sol*" hits are FontAwesome's `solid.*` icon assets.)
- `networkList.js` is UTXO-only (btc/dash/divi/doge/ltc); EVM is handled by
  `eth.js`/`binance.js`/`fio.js`.

So Solana isn't *unfinished* in DiviGo — it's **entirely absent**. Adding it would
be a from-scratch module (keypair derivation, RPC balance, SPL token accounts,
send), comparable in effort to a new chain integration. Note: the **SSO** side
already has working Solana read code (`src/lib/blockchain/tokens.ts` →
`getSolanaTokens`, Helius-backed) for *self-custody* wallets — but that's on-chain
reads, unrelated to DiviGo's custodial pool.
