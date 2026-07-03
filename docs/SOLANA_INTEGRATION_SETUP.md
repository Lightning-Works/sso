# Solana + ownership-proven wallets — SSO setup

## Endpoints added
- **`GET /api/solana-holdings?address=<pubkey>`** — public, address-keyed. SPL + SOL balances and
  NFTs/cNFTs by collection. Mirrors `/api/evm-holdings`. No setup needed (uses the existing Helius key).
- **`POST /api/app/connected-wallets`** — server-to-server, app-credentialed (X-LW-App-Slug + Secret).
  Given `{ email }`, returns that user's **connected** (ownership-proven) wallet addresses. Games use
  this to source proven addresses for token-gating instead of trusting a pasted address.

## One-time DB function (required by /api/app/connected-wallets)

Paste this into the SSO Supabase SQL editor:

```sql
create or replace function public.app_wallets_by_email(p_email text)
returns table(chain_type text, wallet_address text)
language sql security definer set search_path = public as $fn$
  select cw.chain_type, cw.wallet_address
  from public.connected_wallets cw
  join auth.users u on u.id = cw.user_id
  where lower(u.email) = lower(p_email);
$fn$;

grant execute on function public.app_wallets_by_email(text) to service_role;
```

It joins `connected_wallets` to `auth.users` by email (security-definer so the endpoint's service role
can read `auth.users`). Read-only.

## Env
- `NEXT_PUBLIC_HELIUS_API_KEY` — already set; powers all Solana balance/NFT reads.
- The `dreadroot` app must be registered + divigo-enabled in the `apps` table (already done) — that's
  the credential `/api/app/connected-wallets` checks.
