# AWW Mining Data — scope & design

Superadmin-only analytics suite (Admin › Mining Data) to collect Alien Worlds
mining data, learn what works, surface it to users, spot bots, and rank the
planet "teams". Locked to geoff@lightningworks.io (`AW_MINING_ADMIN_EMAILS`,
role `superadmin`).

## Data sources (what's actually available)
- **Loadouts (current):** `m.federation.bags` (equipped tool asset ids) +
  `m.federation.miners` (current_land, last_mine). Tool stats + **shine** from
  AtomicAssets templates. Read live from greymass — no history needed.
- **Rewards (history):** TLM transfers from `m.federation` to the miner, and
  mined-NFT mints (AtomicAssets `logmint`, minter = m.federation). Needs a
  Hyperion / mint-feed worker (the sandbox blocked Hyperion; production can reach it).
- **Cash-out graph:** TLM transfers out of miner wallets → collector wallets.
- **Teams:** `dao.worlds.custodians1` per planet (the elected 5).
- **IPs/geo:** NOT on chain. Only from people who use AWW (beacon → Vercel geo).

## Collection strategy — forward, not backward
The `mine` action doesn't record the bag, and historical bag state needs
state-history (heavy). So we **snapshot current loadouts continuously** and
attribute each miner's later rewards to the snapshot in force at that time.
`aw_collector_state.snapshot_cursor` pages `m.federation.miners`; each run
snapshots the recently-active miners on that page. Wire a cron to `POST
/api/aw/admin/mining/snapshot` to walk the whole active population.

## Schema
`docs/mining_data_schema.sql` — aw_miner_snapshots, aw_mine_events,
aw_nft_drops, aw_reward_transfers, aw_user_ips, aw_syndicate_teams,
aw_collector_state. Run it once in the Supabase SQL editor.

## Analytics to build (once data is flowing)
1. **Miner leaderboard** — TLM & NFTs earned, mines/hour, by planet; filters.
2. **TLM/hr model** — regression of real reward on total luck, total delay,
   planet pool, and commission → measured coefficients that replace the
   theoretical "luck ÷ delay" rule. Confidence intervals per loadout.
3. **NFT drop rate** — Poisson/logistic estimate of drops per unit luck, per
   planet & shine tier; needs large N (rare events).
4. **Data-driven recommender** — given a user's owned tools+land, predict
   expected TLM/hr & NFT/hr and suggest the best 3-tool bag + planet. Shipped
   back to users in the Tool/Upgrade advisors.
5. **Efficient frontier** — best luck-per-delay bags actually observed; what top
   earners run.

## Bot / Sybil detection (ideas → tools)
- **Cadence regularity:** bots mine at clock-precise intervals ≈ cooldown, 24/7,
  with near-zero inter-mine variance. Flag low-variance / round-the-clock miners.
- **Loadout & behaviour clustering:** many accounts with identical bags, claim
  timing, and planet — group by similarity.
- **Cash-out hubs:** many miners transferring rewards to one address (fan-in on
  `aw_reward_transfers`). High in-degree = likely collector/farm.
- **Batch-created accounts:** accounts created by one funder in a tight window
  (creator + creation-time clustering).
- **Shared IPs:** many distinct WAX accounts from one IP in `aw_user_ips`
  (only for accounts that touch AWW).
- Scores are advisory; combine signals, show evidence, never auto-punish.
- Caveat: sophisticated farms disperse funding/IP; treat as leads, not proof.

## Node map
Geo map of AWW users from `aw_user_ips` (country/region/city + counts). Privacy:
this logs real user IPs — keep it admin-only and disclose in a privacy note
before launch.

## Syndicate team rankings
Snapshot each planet's 5 custodians as a "team"; score teams against each other
on planet mining output, staker rewards, participation, and treasury use.
Head-to-head league table across the six planets.

## Status
Shipped: schema SQL, superadmin gate, Admin nav, dashboard shell, forward
collector (loadout snapshots), IP beacon. Next: Hyperion reward/drop worker +
the analytics above.
