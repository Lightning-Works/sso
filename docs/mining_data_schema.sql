-- ============================================================================
-- AWW Mining Data — Supabase schema (run once in the SSO project's SQL editor)
-- All tables are namespaced aw_* and are admin-only (no public RLS grants).
-- Service-role writes only; the app reads via superadmin-gated API routes.
-- ============================================================================

-- Forward-collection: periodic snapshot of a miner's current loadout, so we can
-- attribute their later mine rewards to a known bag without state-history.
create table if not exists aw_miner_snapshots (
  id            bigint generated always as identity primary key,
  captured_at   timestamptz not null default now(),
  miner         text not null,
  planet        text,                    -- lowercased planet name if resolvable
  land_asset_id text,
  land_template bigint,
  tool_ids      text[] not null default '{}',
  tools         jsonb  not null default '[]',  -- [{template_id, shine, delay, luck, ease, rarity}]
  total_luck    int,
  total_delay   int,
  total_ease    int,
  last_mine     timestamptz,
  last_mine_tx  text
);
create index if not exists aw_snap_miner_time on aw_miner_snapshots (miner, captured_at desc);
create index if not exists aw_snap_time on aw_miner_snapshots (captured_at desc);

-- Observed mine outcomes (from a history/Hyperion worker). Attributed to the
-- most recent snapshot for that miner at/just before mine_time.
create table if not exists aw_mine_events (
  id             bigint generated always as identity primary key,
  mine_time      timestamptz not null,
  tx_id          text unique,
  miner          text not null,
  planet         text,
  tlm            numeric,                 -- Trilium rewarded this mine
  nft_template   bigint,                  -- non-null if an NFT dropped
  snapshot_id    bigint references aw_miner_snapshots(id)
);
create index if not exists aw_mine_miner_time on aw_mine_events (miner, mine_time desc);
create index if not exists aw_mine_planet_time on aw_mine_events (planet, mine_time desc);

-- Mined NFT drops (AtomicAssets mint feed, minter = m.federation).
create table if not exists aw_nft_drops (
  id           bigint generated always as identity primary key,
  mint_time    timestamptz not null,
  tx_id        text,
  asset_id     text unique,
  miner        text not null,
  template_id  bigint,
  schema_name  text,
  rarity       text
);
create index if not exists aw_drop_miner_time on aw_nft_drops (miner, mint_time desc);
create index if not exists aw_drop_template on aw_nft_drops (template_id);

-- Reward cash-out graph — TLM transfers OUT of miner wallets (bot/collector
-- detection: many miners funneling to one address).
create table if not exists aw_reward_transfers (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null,
  tx_id        text,
  from_account text not null,
  to_account   text not null,
  amount       numeric,
  memo         text
);
create index if not exists aw_xfer_to on aw_reward_transfers (to_account);
create index if not exists aw_xfer_from on aw_reward_transfers (from_account);

-- IP / geo log of AWW users (the only location data available — chain has none).
-- Captured from Vercel geo headers on a lightweight beacon.
create table if not exists aw_user_ips (
  id          bigint generated always as identity primary key,
  seen_at     timestamptz not null default now(),
  user_id     uuid,
  wax_account text,
  ip          text,
  country     text,
  region      text,
  city        text,
  user_agent  text
);
create index if not exists aw_ip_ip on aw_user_ips (ip);
create index if not exists aw_ip_wax on aw_user_ips (wax_account);

-- Snapshot of each planet's elected 5 custodians (for "team" rankings).
create table if not exists aw_syndicate_teams (
  id           bigint generated always as identity primary key,
  captured_at  timestamptz not null default now(),
  planet       text not null,
  custodians   text[] not null default '{}',
  total_weight numeric,
  total_stake  numeric
);
create index if not exists aw_team_planet_time on aw_syndicate_teams (planet, captured_at desc);

-- Worker bookkeeping (cursors, last-run, counts).
create table if not exists aw_collector_state (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
