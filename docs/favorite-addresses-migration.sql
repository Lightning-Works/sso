-- Saved/favorite wallet addresses per user (used by the Divi wallet page;
-- generic so other chains can reuse it). Run in the Supabase SQL editor.

create table if not exists favorite_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain text not null,
  address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, chain, address)
);

alter table favorite_addresses enable row level security;

-- A user may only see and manage their own favorites.
drop policy if exists "own favorites" on favorite_addresses;
create policy "own favorites" on favorite_addresses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
