-- DiviGo account links + outbound transfer-request audit trail.
--
-- divigo_links: one row per SSO user. Lifecycle:
--   1. User starts linking → row inserted with link_token + token_expires_at,
--      number/route/verified_at NULL.
--   2. User opens t.me/DiviGoBot?start=lwsso_<token> and taps Start.
--   3. DiviGo bot POSTs to /api/divigo/link-callback with the user's
--      DiviGo identity. We fill in number/route/telegram_id, set
--      verified_at, clear link_token.
--   4. UI sees verified_at set on next /status poll and unlocks the wallet.
--
-- A row with NULL verified_at and an expired token is just stale state;
-- relinking simply upserts and bumps token_expires_at again.
--
-- divigo_requests: every transfer request the SSO server sends to DiviGo.
--   Lets /check verify the code belongs to the calling user before polling,
--   gives us a per-user rate-limit signal, and is a forensic trail for any
--   "did I really ask for that?" follow-ups from a user.
--
-- Both tables enable RLS so PostgREST clients see only their own rows; our
-- server routes use the service-role key and bypass RLS.
--
-- Safe to re-run: every statement is `if [not] exists` / `add column if not
-- exists` / `drop policy if exists`.

create table if not exists divigo_links (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  divigo_number     text,
  divigo_route      text,
  linked_at         timestamptz not null default now(),
  last_verified_at  timestamptz,
  last_balance      jsonb,
  unique (divigo_number, divigo_route)
);

-- Pending-link state columns. Added separately so this script is safe to run
-- against a database that already has the original 3-column version of the
-- table. Drops the NOT NULL constraints on number/route too — pending rows
-- have null identity until the bot callback fills them in.
alter table divigo_links
  alter column divigo_number drop not null,
  alter column divigo_route drop not null;

alter table divigo_links
  add column if not exists link_token        text,
  add column if not exists token_expires_at  timestamptz,
  add column if not exists verified_at       timestamptz,
  add column if not exists telegram_id       text,
  add column if not exists divigo_username   text;

create unique index if not exists idx_divigo_links_token on divigo_links(link_token) where link_token is not null;

create table if not exists divigo_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  code            text not null unique,
  coin            text not null,
  amount          numeric not null,
  destination     text not null,
  subject         text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  completed_data  jsonb
);
create index if not exists idx_divigo_requests_user_created on divigo_requests(user_id, created_at desc);

alter table divigo_links enable row level security;
alter table divigo_requests enable row level security;

drop policy if exists divigo_links_self on divigo_links;
create policy divigo_links_self on divigo_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists divigo_requests_self on divigo_requests;
create policy divigo_requests_self on divigo_requests
  for select
  using (auth.uid() = user_id);
