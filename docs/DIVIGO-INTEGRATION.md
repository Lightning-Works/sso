# DiviGo Integration — status & plan

DiviGo is a custodial, messaging-based multi-coin wallet (Telegram primary,
WhatsApp via Botmaker also supported). Users' DIVI is pooled and staked by
DiviGo; the on-chain deposit address shows ~0 (funds are swept into DiviGo's
pool). The only way to read a user's real DiviGo balance/staking, or move
their funds, is DiviGo's API.

The flow stays **non-custodial for us**: we only *request*; DiviGo holds
the keys and the user approves in Telegram on every outgoing transaction.

## Config (server env only — never `NEXT_PUBLIC`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DIVIGO_API_KEY` | yes | The `secret` issued by DiviGo. Without this the client throws `DiviGoNotConfiguredError` on every call. |
| `DIVIGO_PROJECT_NAME` | yes | The project name DiviGo gave us. Shown to the user in the approval prompt ("**LightningWorks** wants to send 100 DIVI to..."). Used as the default `company` field. |
| `DIVIGO_API_BASE` | no | Defaults to `https://divigo.com`. Only set for testing against a different deployment. |

Set them in Vercel → Settings → Environment Variables (Production), then
**redeploy** for the values to take effect. Locally, put them in `.env.local`.

## Client (`src/lib/divigo/client.ts`) — methods implemented

| Method | Purpose |
| --- | --- |
| `balance({ number, route, coin })` | Read a user's balance. `coin: 'all'` returns a non-zero map. For DIVI auto-wallets the value substitutes staking for balance. |
| `requestTransfer({ number, route, coin, amount, destination, subject })` | Ask the user to approve sending out. Returns `{ code }`. `company` defaults to `DIVIGO_PROJECT_NAME`. |
| `checkRequest(code)` | Poll a request. Falsy while pending; truthy when the user has acted. |
| `award({ number, coin, amount })` | Credit DiviGo balance (game rewards). |
| `getGameUser({ user, route })` | Resolve a player by their in-game username. |
| `getPrice(coin)` | Coin price per DiviGo. |
| `register({ number, route })` | Create a DiviGo account. Rarely needed; users normally onboard via the Telegram bot. |
| `diviGoConfigured()` | `true` once `DIVIGO_API_KEY` is set. |

## User-mapping convention

DiviGo identifies a user as a tuple `(number, route)`. From `apiBalance.js`:

- **`number`** — for phone routes (`wa`, `whatsapp`): the full phone with
  country code; the `+` is optional (DiviGo strips it). Must be > 4 chars.
  For `telegram` / `telegramLaunchGoat`: the numeric **Telegram user ID**
  (looked up via `number.id` on the user document).
- **`route`** — one of `telegram`, `telegramLaunchGoat`, `wa`, `whatsapp`,
  `meta`, `signal`. DiviGo normalizes `wa` → `botmaker` server-side. In our
  UI we expose **Telegram** and **WhatsApp** (the two anyone will pick).

We don't try to verify ownership when a user links — DiviGo's balance lookup
can't distinguish "no account" from "account with zero balance everywhere",
and `gameuser` is for *game-username* lookups, not phone lookups. Instead,
ownership is proven implicitly by the Telegram approval on the user's first
send: if a fraudster linked someone else's account they cannot approve.

## What's left to confirm with DiviGo (nice-to-have, not blocking)

- **Shape of `paymentRequestCompleted`** returned by `check` once the user
  approves or denies. The dispatcher returns it as-is; we treat any truthy
  value as completion and surface the raw payload to the user. If it carries
  `{ approved: true, tx: '...' }` we'll display the tx; if it's just `true`
  we'll show "approved".
- **`/gotTX` webhook** — DiviGo's `ALLOWED_TX_IPS` only guards an inbound
  webhook (`gotTX`) that pushes block confirmations to us. We do not consume
  this today; add our server IP only if/when we wire that webhook up. It is
  **not** needed for outbound transaction requests.

## Wired on our side

- `src/lib/divigo/client.ts` — typed client (above).
- `divigo_links` table — `(user_id PK, divigo_number, divigo_route,
  linked_at, last_verified_at, last_balance)` with unique
  `(divigo_number, divigo_route)` so one DiviGo account can't be claimed by
  two SSO users. Migration in `docs/divigo-links-migration.sql`.
- `divigo_requests` table — audit trail for every `requestTransfer` call.
- `src/app/api/divigo/*` — server routes for link / unlink / status /
  balance / request-transfer / check.
- `src/app/wallet/divi/page.tsx` — link form, live balance, and Send →
  Telegram approval polling, all greyed when `DIVIGO_API_KEY` isn't set.
