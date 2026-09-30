-- platform_identities: the cross-app identity graph.
--
-- One row per (platform, platform_user_id) edge that points at ONE canonical LW-SSO user
-- (auth.users.id). This is what lets a character bot recognise the same human across apps:
-- Telegram, Discord, in-game, etc. all become edges onto the same user_id.
--
--   platform          'telegram' | 'discord' | 'game:siegeworlds' | ...  (namespaced, free-form)
--   platform_user_id  the raw immutable id on that platform (Telegram numeric id, Discord id, ...)
--   platform_username @handle if any (display only; NEVER the identity key — handles change)
--   verified_at       set once the link is proven (via a link code or the account page). Only
--                     verified rows count for recognition/entitlements. NULL = pending.
--   link_token        short-lived token for the pending-link handshake (bot <-> account page)
--   meta              jsonb for platform-specific extras, e.g. the DiviGo { divigo_number,
--                     divigo_route } so holdings lookups need no second query.
--
-- Telegram links captured earlier live in divigo_links; the /api/agent/facts resolver reads
-- platform_identities first and falls back to divigo_links, so nothing has to be migrated up
-- front. New links (all platforms) should be written here.
--
-- RLS on: PostgREST clients see only their own rows; server routes use the service-role key and
-- bypass RLS. Safe to re-run (every statement is if-[not-]exists / drop-if-exists).

create table if not exists platform_identities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  platform          text not null,
  platform_user_id  text,  -- null while a link is PENDING (unknown until the bot confirms); set on verify
  platform_username text,
  linked_at         timestamptz not null default now(),
  verified_at       timestamptz,
  link_token        text,
  token_expires_at  timestamptz,
  meta              jsonb,
  unique (platform, platform_user_id)
);

-- Make platform_user_id nullable for pending rows, safe against the earlier NOT NULL version.
alter table platform_identities alter column platform_user_id drop not null;

create index if not exists idx_platform_identities_user on platform_identities(user_id);
create unique index if not exists idx_platform_identities_token
  on platform_identities(link_token) where link_token is not null;

alter table platform_identities enable row level security;

drop policy if exists platform_identities_self on platform_identities;
create policy platform_identities_self on platform_identities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
