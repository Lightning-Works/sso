-- DiviGo custom ERC-20 token registry.
--
-- Lets a superadmin register arbitrary ERC-20 (EVM) tokens for the chains
-- DiviGo runs on (Ethereum, Polygon, BSC/Binance, Waterfall). This is the
-- SSO-side half of the feature: a forward-compatible registry. DiviGo's
-- backend currently hardcodes its token list (ERC20_CONTRACTS in eth.js) and
-- exposes NO API to add one, so until they ship that (see
-- docs/DIVIGO-ERC20-TOKEN-REPORT.md) these rows can't be sent/pooled by
-- DiviGo. We store them now so the moment DiviGo adds slug + send wiring,
-- the SSO wallet can consume them with no further schema change.
--
-- Writes are gated to superadmins on an email allowlist (DIVIGO_TOKEN_ADMIN_EMAILS)
-- in the API layer; the table itself is service-role only via RLS.
--
-- Safe to re-run.

create table if not exists divigo_custom_tokens (
  id               uuid primary key default gen_random_uuid(),
  chain            text not null,          -- 'ethereum' | 'polygon' | 'bsc' | 'waterfall'
  contract_address text not null,          -- 0x + 40 hex, stored lowercased
  symbol           text not null,          -- display ticker, e.g. 'LINK'
  name             text not null,          -- 'Chainlink'
  decimals         int  not null default 18,
  divigo_slug      text,                   -- the coin slug DiviGo will route on once they add it; null until known
  logo_url         text,
  -- send_enabled stays false until DiviGo confirms it can actually send this
  -- token from its pool. Keeps the user wallet from offering guaranteed-fail
  -- money actions. An admin flips it on once the report's backend work lands.
  send_enabled     boolean not null default false,
  enabled          boolean not null default true,   -- soft on/off without deleting
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (chain, contract_address)
);

create index if not exists idx_divigo_custom_tokens_enabled
  on divigo_custom_tokens(chain) where enabled;

alter table divigo_custom_tokens enable row level security;

-- No client policy: all access is via service-role server routes. RLS on with
-- no policy = PostgREST/anon sees nothing, which is what we want.
drop policy if exists divigo_custom_tokens_no_client on divigo_custom_tokens;
