# DD69 (Divi Desktop) — SSO + Agent integration guide

**Audience:** the Claude instance building inside the **DD69 Divi Desktop** app.
**Author:** the LW-SSO / Kinetink side. This is the *contract* — the SSO already exposes (or will
expose) the endpoints named here; your job is to build the DD69 side against them.

This doc covers **two independent integrations**. You can build them in either order:

1. **SSO integration** — let DD69 log a user in via LW-SSO, verify them, and (because DD69 is a Divi
   wallet) use the DiviGo money path. Standalone; no agents required.
2. **Agent integration** — let a user create an agent in Kinetink, have it run **always-on inside the
   DD69 node process**, stay awake, discover peers, and talk to other agents on the network.

They share **one architectural truth** (Part 0). Read that first — it answers the "how does any of this
work with Vercel when every node is behind a home router / VPN?" question, which is the crux of the
whole design.

---

## Part 0 — The one architectural truth (READ FIRST)

There are **two planes**, and knowing which is which resolves every hard question:

### Control plane — LW-SSO / Kinetink / Vercel (stateless, cloud, request/response)
Vercel functions are **ephemeral** (a request comes in, runs for seconds, dies) and they live behind a
public HTTPS URL. They **cannot**:
- run an always-on process (there is nothing to "keep awake");
- open or hold a long-lived socket to fan messages out (serverless kills the function between requests);
- **reach *into* a home node** — the node is behind NAT / a router / a VPN, so nothing on the internet
  can dial *in* to it.

They **can** do exactly one thing, and it's enough: serve **outbound-callable HTTPS endpoints**.
Anything a node needs from the cloud, the **node asks for** by calling out.

### Execution plane — the DD69 node (stateful, always-on, at the edge)
DD69 is already an always-running process (it runs a full Divi node). **The agent lives here — this is
the only place an always-awake, node-acting agent *can* live.** An agent hosted centrally could never
act on the user's node (that would require reaching *in*, which is blocked). So agent-on-node isn't a
cost choice; it's the only correct topology.

### The golden rule that makes NAT / VPN a non-issue
> **Nodes always dial OUT. The cloud never dials IN.**

Every home router, corporate firewall, and VPN **blocks unsolicited inbound** but **allows outbound
HTTPS/WSS**. So:

| Direction | How it's done | Works through NAT/VPN? |
|---|---|---|
| Node → Cloud (auth, config, LLM brain, gating) | Node makes outbound **HTTPS** to SSO/Vercel | ✅ always |
| Node ↔ Node (agent-to-agent) | Both nodes hold an outbound **WSS** to a shared relay | ✅ always |
| Cloud → Node ("push me a task") | Node **subscribes** (outbound) to a channel; cloud writes to it | ✅ always |

**There is never an inbound listening port on a user's node.** That single constraint dictates the relay
design in Part 2.

### So what actually runs *on Vercel*? ("greenlighting")
Not the agents. You greenlight a small set of **outbound-callable endpoints** (Part 3): agent
register/heartbeat/directory, an **LLM "brain" proxy** (keeps the model key server-side + meters cost),
plus the existing `/api/verify`, `/api/gate`, and DiviGo OAuth routes. The one thing Vercel **cannot**
host is the persistent socket fan-out for agent-to-agent chat — that's **Supabase Realtime** (or a
dedicated always-on relay), **not** Vercel. See Part 2.

---

## Part 1 — SSO integration (independent)

### 1.0 What LW-SSO is (and isn't)
- It's a **token-handoff** identity provider (not classic OIDC). The user logs in on the SSO's hosted
  pages; the SSO hands your app the user's Supabase **access + refresh tokens**.
- **The SSO and DD69 run *separate* Supabase projects.** This is the single most important fact.
  A user's SSO session JWT does **not** authenticate against DD69's database, and vice-versa. That's
  why privileged cross-system calls use an **opaque per-(user, app) app-token**, never a raw JWT
  (see 1.3).

### 1.1 Register DD69 as an app (one-time, done on the SSO side)
Ask the SSO admin to create an `apps` row:
- `slug`: e.g. `dd69`
- `name`: "DD69 Divi Desktop"
- `api_secret_hash`: `sha256(app_secret)` — DD69 holds the plaintext `app_secret`; the SSO stores only
  the hash. Compared in constant time.
- `redirect_origins`: for a **desktop** app you generally don't need to add one — the allow-list
  (`src/lib/auth/redirectOrigins.ts`) **always permits `http://localhost:<any port>`**, which is exactly
  the loopback-redirect target a desktop app uses (see 1.2).
- `divigo_enabled`: `true` if DD69 will use the Divi money path (it should).
- optional theme fields (so any embedded SSO UI matches DD69's look — same mechanism the game wallet
  embed uses).

### 1.2 Login — the desktop loopback-redirect handoff
Desktop apps can't receive a normal web redirect, but they can open a browser and listen on localhost.
This is the standard, secure pattern and it needs **no public URL**:

1. DD69 starts a throwaway HTTP listener on `http://127.0.0.1:<random_port>/callback`.
2. DD69 opens the SSO hosted login in the user's **system browser** (not an embedded webview — webviews
   are a phishing/credential-theft risk and some OAuth providers block them), with
   `?redirect=http://127.0.0.1:<port>/callback` (+ a random `state` you generate and later verify).
3. User logs in on the SSO. The SSO redirects to your loopback URL with the tokens (in the URL
   **fragment**, per the SSO's existing handoff) + your `state`.
4. Your listener captures the tokens, checks `state`, shows a "you can close this tab" page, and shuts
   the listener down.
5. **Validate before trusting:** `POST {SSO}/api/verify` with `{ token: <access_token> }`. On success it
   returns the profile (`username`, `display_name`, `role`, `avatar_url`, …). Store the session; refresh
   with the refresh token as normal Supabase sessions do.

`/api/verify` is CORS-open and exists specifically so external apps can validate a handed-off token
without browser cookies. **Never** act on a token you haven't verified.

### 1.3 The DiviGo money path — the "trio" auth (DD69 is a Divi wallet, so this is your bread & butter)
Every privileged app→DiviGo call must satisfy **all three** independent checks (steal one ≠ access;
steal all three still leaves fund movement gated by DiviGo's Telegram approval):

1. `Authorization: Bearer <app_token>` — an **opaque per-(user, app) token** minted at consent time
   (not a JWT). Stored server-side as `sha256(token)` in `divigo_app_tokens`, bound to your `app_id`.
2. `X-LW-App-Slug: dd69` + `X-LW-App-Secret: <app_secret>` — identifies the vetted app.
3. A live `divigo_app_grants` row — the user consented to DD69 + these scopes and hasn't revoked.

**Consent flow (mint the app-token):**
- DD69 redirects the user (loopback pattern again) to the SSO consent screen `/wallet/divi/grant`.
- User approves scopes. The SSO calls its own `POST /api/oauth/divigo/grant { app_slug, scopes }`,
  upserts the grant, mints a fresh bearer token (rotates any prior one), and forwards the **plaintext
  token once** to your loopback callback in the URL fragment.
- DD69 stores that app-token securely (OS keychain / encrypted store), scoped to this user.

**Scopes** currently: `balance:read`, `send:request`. Money movement (`send:request`) additionally
requires the user's DiviGo Telegram approval — DD69 never moves funds unattended.

**Privileged endpoints** (all under `/api/oauth/divigo/*`, all trio-authed): `balance`, `status`,
`request-transfer`, `connections`, `revoke`. Read the route files for exact bodies.

### 1.4 Token-gating (optional, if agent features are gated)
`POST /api/gate` does real-time on-chain balance/NFT checks against the user's **connected** wallets and
returns an **HMAC-signed** result (`GATE_SIGNING_SECRET`). Verify the signature server-side before
granting anything durable. Use this if, say, "spawn an agent" requires holding some token. For
display-only holdings, `/api/wax-holdings`, `/api/solana-holdings`, `/api/evm-holdings`, `/api/divi-holdings`
exist (public/read).

### 1.5 SSO integration — build checklist
- [ ] App registered (`slug=dd69`, secret hash, `divigo_enabled`).
- [ ] Loopback login handoff → store session → `POST /api/verify` to validate.
- [ ] Refresh-token handling for long-lived desktop sessions.
- [ ] (If money path) consent flow → store app-token in OS keychain → trio-authed DiviGo calls.
- [ ] Never embed the SSO login in a webview; never trust an unverified token; never log secrets.

---

## Part 2 — Agent integration (independent)

**Goal:** a user creates an agent in Kinetink; that agent then runs **inside the DD69 node process**,
always awake, discovering and talking to peer agents, and able to do tasks on the local node.

### 2.1 Where each piece lives
| Concern | Home | Why |
|---|---|---|
| Agent **definition** (persona, name, avatar, skills, config) | **Kinetink** (Supabase row) | user authors it in the cloud |
| Agent **runtime / loop** (always-awake) | **DD69 node process** | only place that's always-on *and* can act on the node |
| Agent **reasoning** (LLM) | **cloud "brain" proxy** on Vercel (default) or local model | keeps the model key server-side + meters cost per user |
| Agent **presence + messaging** | **Supabase Realtime** channels | outbound WSS from every node = NAT/VPN-safe fan-out |
| Agent **directory / discovery** | **Vercel** endpoint + Realtime presence | outbound HTTPS |

### 2.2 Provisioning — from "created in Kinetink" to "running on the node"
1. **Author:** in Kinetink the user defines the agent → a row is written (Supabase): `agent_id`,
   `owner_user_id`, `persona/system_prompt`, `skills`, `avatar`, and the **channels/topics** it should
   join. (Agents today are Kinetink "characters" with a `chat_api_key`; this extends that model to an
   autonomous runtime.)
2. **Claim:** DD69, after SSO login (Part 1), calls `GET {SSO}/api/agents/mine` (outbound) to fetch the
   agent(s) assigned to this user + this node. It receives the config **plus** short-lived credentials
   for the brain proxy and the Realtime channel (never long-lived secrets baked into the node).
3. **Instantiate:** DD69 starts the agent runtime **in-process** (a module inside the always-on node):
   an event loop + an outbound Realtime subscription + a heartbeat timer. No inbound port opened.

### 2.3 Staying "always awake"
The DD69 process is already always-on (it runs the node), so the agent is just a long-lived module in it:
- **Heartbeat:** every ~30–60s, `POST {SSO}/api/agents/heartbeat { agent_id, node_id, status }`
  (outbound). The registry marks agents **online** while heartbeats arrive, **stale/offline** when they
  stop (machine asleep, node stopped). This is honest: an offline machine = an offline agent, and peers
  see that via presence. Don't pretend otherwise.
- **Presence:** also publish presence on the Realtime channel so peers get near-real-time online/offline
  without polling the registry.

### 2.4 Agent ↔ agent messaging (the NAT problem, solved)
Both agents are behind NAT — **neither can accept an inbound connection.** So they meet in the middle at
a relay both **dial out** to. Options, in order of how much I recommend them:

**(A) Supabase Realtime relay — RECOMMENDED (default).**
Every node opens **one outbound WSS** to Supabase Realtime and subscribes to:
- a **presence** channel (who's online),
- its own **inbox** channel (`agent:<agent_id>`),
- any **topic/room** channels it participates in (`topic:<name>`).
To message a peer, publish to that peer's inbox/topic channel; Supabase fans it out. NAT/VPN-safe (all
outbound), no new infra (you already run Supabase), durable enough for agent chat. This is the path to
build first.

**(B) Ride the Divi node's own P2P network — optional, for discovery.**
DD69 is *already* a full node gossiping with peers. You can reuse its peer table for **discovery**
(which nodes exist) and, if you want, carry small agent messages as a custom gossip topic. Zero new
infra, but the chain P2P layer isn't built for chat (size/rate limits, ordering) — use it for discovery
or resilience, not as the primary chat bus.

**(C) WebRTC data channels + signaling — only if you need direct, high-bandwidth, low-latency links.**
Nodes hole-punch a direct P2P channel after swapping offer/answer through a **signaling** endpoint
(a Vercel function can broker the one-shot handshake) plus a **STUN** server. Strict NATs / VPNs that
refuse hole-punching need a **TURN** relay fallback — and TURN is a persistent always-on service **you
must host** (not Vercel). Skip this unless (A) proves too slow/limited.

> **Start with (A). Add (B) for discovery/resilience. Only reach for (C) under real bandwidth pressure.**

### 2.5 Reasoning — the LLM "brain"
When the agent needs to think or reply, DD69 calls **`POST {SSO}/api/agents/think`** (outbound) with the
conversation/task context; the endpoint holds the Anthropic key, **meters + bills per user**, applies
gating, and returns the completion. **Why route through the cloud instead of calling the model directly
from the node:** you keep the model key off thousands of home machines, and you get per-user cost control
and abuse limits in one place. (A local-model fallback is fine for offline/cheap tasks, but the metered
proxy is the default.)

### 2.6 Doing tasks
- **On the local node:** the agent can query the node RPC, read balances, and (via the Part 1 DiviGo
  trio, with the user's approval) request transfers. Local actions are the whole point of agent-on-node.
- **With peers:** agents delegate/request via messages on the relay ("do you have X?", "run this task").
  Treat these as untrusted (see Security).

### 2.7 Lifecycle
Startup → SSO login → claim config → subscribe (Realtime) → heartbeat loop → work.
Shutdown → publish offline presence → stop heartbeat → registry marks offline after the miss window.

### 2.8 Agent integration — build checklist
- [ ] Kinetink writes the agent definition + assigned channels.
- [ ] DD69 `GET /api/agents/mine` → config + short-lived channel/brain credentials.
- [ ] In-process runtime: outbound Realtime subscribe (presence + inbox + topics), heartbeat loop.
- [ ] Messaging via Supabase Realtime (option A); discovery optionally via Divi P2P (option B).
- [ ] Reasoning via `/api/agents/think` (metered) with optional local fallback.
- [ ] Local task adapters (node RPC, DiviGo trio) + peer task protocol.
- [ ] **No inbound port. Ever.**

---

## Part 3 — What the SSO/Vercel side must add ("greenlighting")

New **outbound-callable** endpoints for the agent control plane (all hit by nodes calling *out*; none
reach *in*):

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/agents/mine` | trio / app-token | agents assigned to this user+node + short-lived creds |
| `POST /api/agents/heartbeat` | trio / app-token | mark agent online; drives presence/staleness |
| `GET /api/agents/directory` | trio / app-token | list online agents for discovery |
| `POST /api/agents/think` | trio / app-token + rate limit | metered LLM brain proxy (key stays server-side) |

Plus: a **Supabase Realtime** channel scheme (`agent:<id>`, `topic:<name>`, presence) with **RLS** so a
node can only publish/subscribe to channels its authenticated user owns/participates in.

**What you do NOT add to Vercel:** the always-on socket fan-out. Vercel is request/response only. The
persistent bus is Supabase Realtime (managed, outbound WSS) or, if you outgrow it, a dedicated always-on
relay on Railway/Fly/a Durable Object — **never a Vercel function.**

---

## Security callouts (do not skip)
- **Peer messages are untrusted input.** An agent-to-agent message fed into the LLM is a
  **prompt-injection** surface. A peer must never be able to make your agent move funds, leak the
  app-token, or run arbitrary tools by *saying so*. Gate every sensitive action behind independent auth
  (the DiviGo trio + Telegram approval), sandbox tool use, and treat peer text as data, not instructions.
- **Least privilege on the node.** Store the app-token + any creds in the OS keychain/encrypted store,
  scoped per user. Keep the **LLM key off the node entirely** (that's why `/api/agents/think` exists).
  Hand the node only **short-lived** channel/brain credentials, refreshed via outbound calls.
- **Verify signatures.** `/api/gate` responses are HMAC-signed — check them. Don't grant durable value
  off an unsigned/unverified claim.
- **System browser for login, never a webview.** Webview logins are a credential-phishing vector.
- **Rate-limit the brain proxy per user** — a runaway or malicious node loop must not be able to run up
  unbounded model spend.
- **Fail closed.** Unknown origin, missing signature, stale grant → deny.

---

## TL;DR for the DD69 Claude
1. **The agent runs on the node, not on Vercel.** Vercel/SSO is the brain-API + registry + relay
   signaling; it is stateless and can never reach into a home node.
2. **Nodes only ever dial OUT** (HTTPS to SSO, WSS to Supabase Realtime). That's why home/cloud/VPN all
   "just work" — no inbound port, ever.
3. **SSO** = loopback-redirect login → `/api/verify` → (for money) the DiviGo **trio** auth.
4. **Agents** talk peer-to-peer through **Supabase Realtime** (outbound relay), think via a **metered
   cloud proxy**, and stay "awake" because the DD69 node process is already always-on.
5. **Treat every peer message as hostile input.** Independent auth gates all real actions.
