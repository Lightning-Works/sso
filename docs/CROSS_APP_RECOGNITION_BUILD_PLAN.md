# Cross-App Character Recognition — Build Plan

Status date: 2026-09-27. Owner lane: this file is the single source of truth; each repo does its
named part. Written after a full audit of DiviGo agents, Kinet.ink, LW-SSO, and GoBanq.

## The goal
An AI character (Skylie, Shi Yang, ...) recognises the SAME human across apps (Telegram now;
Discord, in-game, web later) as ONE person. In PRIVATE (a DM) she can reference past interactions
and grant access to that person's wallet / NFTs / tools; in PUBLIC she stays discreet. Recognition
is OPT-IN: a platform account is only recognised after the user links it once.

## Ownership / who stores what (decided with Geoff, 2026-09-27)
- **Kinet.ink** = the character factory + in-the-moment brain. Holds character IP (personality,
  voice, knowledge/lore) and runs live chat. For LightningWorks characters that IP is LightningWorks';
  for third-party Kinet.ink customers, theirs. Kinet.ink does NOT own the user's memories.
- **GoBanq** = the vault. The single hardened store for everything sensitive about a person:
  private keys (already there), custody, and (new) per-user memories + conversation history — for
  LightningWorks/GoBanq-owned characters only. Third-party Kinet.ink customers keep Kinet.ink-native
  memory (so Kinet.ink stays a sellable product and other companies' user data stays out of the vault).
- **LW-SSO** (the identity face of GoBanq) = the anchor. The one canonical person id
  (`auth.users.id`), the Connected Logins page, the platform-identity graph, and the private
  "who is this / what do they own" lookup for bots.
- **The bots** (divigo-ai-agents, ...) = thin clients. No identity of their own: they ask LW-SSO
  "who is this platform user," then fetch memory + reply.

Key principle: memory + entitlements are keyed by the **canonical person id**, never by a raw
platform id. Platform ids (telegram, discord, game) are edges that link to it.

## Phases

### Phase 1 — LW-SSO foundation (IN PROGRESS)
- [x] `platform_identities` table: the generic identity graph (`docs/platform-identities-migration.sql`).
- [x] `POST /api/agent/facts`: reverse lookup (platform id -> canonical person + holdings), the
      endpoint the bot already calls. Reads platform_identities, falls back to divigo_links.
      Fails closed. (`src/app/api/agent/facts/route.ts`).
- [ ] GO-LIVE (Geoff / deploy step): run the migration on the SSO Supabase; set env
      `AGENT_FACTS_SECRET` (+ optional `AGENT_PORTAL_CONTRACT` / `AGENT_PORTAL_NETWORK`) on SSO;
      deploy SSO; set `AGENT_SSO_BASE` + `AGENT_SSO_SECRET` on the bots (Railway). Quick win: every
      user who already linked DiviGo is recognised immediately (holdings-based adult tier starts
      working for them).

### Phase 2 — Linking flow (all platforms, Telegram first)
- [ ] LW-SSO account page (https://sso.lightningworks.io/account, "Connected Logins"): add a
      "Connect Telegram" control (leave room for Discord/others). Issues a link token, deep-links
      the bot, writes a verified `platform_identities` row on callback. Reuse the existing
      `divigo/link` + `link-callback` pattern, generalised.
- [ ] In-chat link path: bot issues a short code, user pastes it on the account page (Kinet.ink
      already has the code mechanics in `platform-link`; SSO has the spec).
- [ ] Model `hasActiveSubscription` + `ageVerified` in LW-SSO and surface them in /api/agent/facts.

### Phase 3 — GoBanq memory vault
- [ ] Stand up per-user memory in GoBanq (encrypted at rest), keyed by canonical person id.
- [ ] Meaning-based (vector) search over memories — the one piece of real build work in moving
      memory out of Kinet.ink's Postgres (which already has pgvector). Decide vector approach in
      GoBanq's Mongo stack.
- [ ] Memory API (store / retrieve-by-meaning) for Kinet.ink to call per chat turn.

### Phase 4 — Kinet.ink memory backend switch
- [ ] Pluggable memory backend: GoBanq for LightningWorks characters, Kinet.ink-native for others.
- [ ] Key memory by canonical person id (from facts) so it unifies across platforms by design.
- [ ] Make the read path resolve identity via the graph (fix the current per-platform silo).

### Phase 5 — Bot wiring
- [ ] Pass the resolved `ssoUserId` (not the raw Telegram id) to Kinet.ink as the user key.
- [ ] Send the DM-vs-group visibility flag so "personal in a DM, discreet in public" works
      (Kinet.ink's C21/C22 clearance filter already enforces it when told the context).

### Phase 6 — More channels (later, do NOT build yet)
- [ ] Discord agent (and other channels). Nothing in Phases 1-5 is Telegram-specific, so these
      slot in as new `platform_identities` edges + a new thin client.

## Contracts / env vars
- Bot -> SSO: `POST {AGENT_SSO_BASE}/api/agent/facts`, header `X-Agent-Secret: {AGENT_SSO_SECRET}`,
  body `{ telegram_id }` -> `{ linked, ssoUserId, diviBalance, ownsPortalNft, hasActiveSubscription, ageVerified }`.
- SSO env: `AGENT_FACTS_SECRET` (must equal the bot's `AGENT_SSO_SECRET`), optional
  `AGENT_PORTAL_CONTRACT` + `AGENT_PORTAL_NETWORK` (eth|poly) for the Portal-NFT check.
- Bot env (divigo-ai-agents, Railway): `AGENT_SSO_BASE` = https://sso.lightningworks.io,
  `AGENT_SSO_SECRET` = the shared secret.

## Notes
- Fund MOVEMENT stays behind the user's own confirmation (DiviGo enforces this). Recognition gates
  READ access, tiers, and tools, not silent spending.
- The bot side is already coded (`divigo-ai-agents/src/agent/walletLink.js`); Phase 1 just needs
  the SSO endpoint + env, no bot code change.
