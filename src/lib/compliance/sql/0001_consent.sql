-- Compliance: consent + opt-in storage. Run via the Supabase management API (the
-- same way this project applies other SQL). Append-only consent_records = the audit
-- trail; the latest row per user is the current state.

create table if not exists public.consent_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  region_id     text not null,
  notice_version text not null,
  consent_model text not null,
  choices       jsonb not null default '{}'::jsonb,
  ip            inet,               -- proof of consent (not ongoing tracking)
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists consent_records_user_idx on public.consent_records (user_id, created_at desc);

-- Row Level Security: a user may read ONLY their own consent history; inserts are
-- done server-side with the service-role key (which bypasses RLS), never by clients.
alter table public.consent_records enable row level security;

drop policy if exists consent_own_select on public.consent_records;
create policy consent_own_select on public.consent_records
  for select using (auth.uid() = user_id);

-- No client insert/update/delete policy on purpose: the record is immutable and
-- written only by the server. (Service role bypasses RLS for the insert.)

comment on table public.consent_records is
  'Immutable GDPR/CCPA consent audit trail. Latest row per user_id is current state. IP is consent-proof only.';
