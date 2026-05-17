-- Per-app allowed redirect / CORS origins.
-- Run this in the Supabase SQL editor BEFORE (or together with) deploying
-- the per-app redirect-origins change.
--
-- Until this column exists, validation transparently falls back to the
-- ALLOWED_REDIRECT_ORIGINS / NEXT_PUBLIC_ALLOWED_REDIRECT_ORIGINS env vars,
-- so existing integrations keep working and nothing breaks.

alter table apps
  add column if not exists redirect_origins text[] not null default '{}';

comment on column apps.redirect_origins is
  'Allowed redirect/token-handoff origins for this app. Each entry is an exact origin (https://app.example.com) or a wildcard-subdomain pattern (https://*.example.com). http://localhost:* is always allowed for local dev. If empty, validation falls back to the ALLOWED_REDIRECT_ORIGINS env list.';
