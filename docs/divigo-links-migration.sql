-- DiviGo account links + outbound transfer-request audit trail.
--
-- divigo_links: one row per SSO user, mapping them to their DiviGo account
--   identifier (number + route). Primary key is user_id so a user can link
--   at most one DiviGo account at a time. The (number, route) tuple is
--   uniquely constrained too, so the same DiviGo account can't be claimed
--   by two different SSO users — important even though Telegram approval
--   makes silent theft impossible.
--
-- divigo_requests: every transfer request the SSO server sends to DiviGo.
--   Lets /check verify the code belongs to the calling user before polling,
--   gives us a per-user rate-limit signal, and is a forensic trail for any
--   "did I really ask for that?" follow-ups from a user.
--
-- Both tables enable RLS so PostgREST clients see only their own rows; our
-- server routes use the service-role key and bypass RLS.

create table if not exists divigo_links (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  divigo_number     text not null,
  divigo_route      text not null,
  linked_at         timestamptz not null default now(),
  last_verified_at  timestamptz,
  last_balance      jsonb,
  unique (divigo_number, divigo_route)
);

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
