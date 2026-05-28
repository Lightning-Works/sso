-- DiviGo wallet-as-a-service: per-app grants + audit + admin gating.
--
-- Architecture (see DIVIGO-INTEGRATION.md):
--   1. apps gains divigo_enabled (admin-only toggle) and api_secret_hash
--      (sha256 hex of the per-app secret used in X-LW-App-Secret).
--   2. divigo_app_grants captures user consent per app, with the specific
--      scopes ('balance:read', 'send:request', ...) the user granted.
--   3. divigo_app_audit is one row per app→DiviGo action. Used both as a
--      forensic trail and as the rate-limit signal (counting recent rows
--      per user+app is cheaper than a separate counter store).
--   4. divigo_requests grows app_id + idempotency_key so app-mediated
--      sends are attributable to the originating app and DreadRoot can
--      retry a Buy click without spamming approval prompts.
--
-- Safe to re-run.

alter table apps add column if not exists divigo_enabled boolean not null default false;
alter table apps add column if not exists api_secret_hash text;

create table if not exists divigo_app_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  app_id        bigint not null references apps(id) on delete cascade,
  scopes        text[] not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (user_id, app_id)
);
create index if not exists idx_divigo_app_grants_user on divigo_app_grants(user_id);

create table if not exists divigo_app_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  app_id      bigint not null references apps(id) on delete cascade,
  action      text not null,          -- 'balance.read' | 'send.request' | 'send.check' | 'grant' | 'revoke'
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_divigo_app_audit_user_app_created
  on divigo_app_audit(user_id, app_id, created_at desc);

-- Add app_id + idempotency_key to divigo_requests so the OAuth send-flow
-- can dedupe retries and so /check can verify the code was created by the
-- same app that's now asking about it.
alter table divigo_requests add column if not exists app_id bigint references apps(id) on delete set null;
alter table divigo_requests add column if not exists idempotency_key text;
create unique index if not exists idx_divigo_requests_app_idem
  on divigo_requests(user_id, app_id, idempotency_key)
  where idempotency_key is not null;

-- Per-(user, app) opaque bearer tokens.
--
-- Issued at consent time and returned to the app's callback ONCE. Apps
-- present plaintext via Authorization: Bearer <token>; we sha256 it and
-- look up by hash. One token per (user, app); regrant rotates.
create table if not exists divigo_app_tokens (
  token_hash    text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  app_id        bigint not null references apps(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  unique (user_id, app_id)
);
create index if not exists idx_divigo_app_tokens_user on divigo_app_tokens(user_id);
create index if not exists idx_divigo_app_tokens_app  on divigo_app_tokens(app_id);

alter table divigo_app_grants enable row level security;
alter table divigo_app_audit  enable row level security;
alter table divigo_app_tokens enable row level security;
-- App tokens are server-side bearer secrets — never readable from PostgREST.
-- (Default deny: no policy = no rows returned via the anon/auth roles.
-- Our server routes use the service-role key and bypass RLS.)

drop policy if exists divigo_app_grants_self on divigo_app_grants;
create policy divigo_app_grants_self on divigo_app_grants
  for select using (auth.uid() = user_id);

drop policy if exists divigo_app_audit_self on divigo_app_audit;
create policy divigo_app_audit_self on divigo_app_audit
  for select using (auth.uid() = user_id);
