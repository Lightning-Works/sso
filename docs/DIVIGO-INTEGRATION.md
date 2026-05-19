# DiviGo Integration — status & plan

DiviGo is a custodial, Telegram-based multi-coin wallet. Users' DIVI is
pooled and staked by DiviGo; the on-chain deposit address shows ~0 (proven
earlier — funds are swept into DiviGo's pool). The only way to read a
user's real DiviGo balance/staking, or move their funds, is DiviGo's API.

## What's built (no API key required yet)

- `src/lib/divigo/client.ts` — server-side, typed client for DiviGo's
  `POST {base}/api` gateway. Implements the documented methods:
  - `requestTransfer()` — ask the user to approve sending DIVI out of
    their DiviGo balance (they approve in Telegram; DiviGo sends from the
    pool and debits them). Returns a request code.
  - `checkRequest(code)` — poll that request's status.
  - `award()` — credit DIVI into a user (e.g. game rewards).
  - `getGameUser()` — resolve/verify a user's DiviGo account.
  - `getPrice()`.
  - `diviGoConfigured()` — false until a key is set; calls throw
    `DiviGoNotConfiguredError` so nothing fails silently.

Config (server env only — never `NEXT_PUBLIC`):
- `DIVIGO_API_BASE` (default `https://divigo.com`)
- `DIVIGO_API_KEY` (the `secret`; **not yet issued**)

The flow stays **non-custodial for us**: we only request; DiviGo holds
keys and the user approves in Telegram.

## Blocked on the DiviGo team (get these, then wire it up)

1. An **active API key** (their `APIKeys` collection) issued to us.
2. Confirm prod base URL (`https://divigo.com`) and the exact
   request/response shapes (their framework is custom `gnodejs`; the
   README documents params, not full response schemas).
3. **IP allow-listing**: our server's egress IP added to DiviGo's
   `ALLOWED_TX_IPS` for transaction calls/webhooks.
4. **User mapping**: how an SSO user maps to a DiviGo account. DiviGo keys
   users by phone + messaging route (e.g. `telegram`); resolve via
   `getGameUser({ user, route:'telegram' })`. Need the canonical
   identifier we pass as `number`.
5. **Balance/staking read**: the documented `/api` methods are
   price/gameuser/check/request/award — none is an explicit
   "read this user's balance/staking". DiviGo's `Wallet` model has
   `balance`, `held`, `staking`, so they have the number; confirm whether
   `gameuser` returns it or request a dedicated method. This is what would
   let the SSO show the real (e.g. 436,864) balance + staking.

## Then (once unblocked)

- Add the SSO↔DiviGo user link (store/resolve the user's DiviGo identifier).
- Show real DiviGo balance/staking on `/wallet/divi` when the user is a
  DiviGo user (vs the on-chain self-custody path, which stays as-is).
- Optional: a guarded server endpoint for games to initiate a
  `requestTransfer` (user approves in Telegram) — moves money, so it must
  be admin/scoped and audited; do not expose broadly.
