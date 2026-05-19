# Arweave "double fallback" for comics

Three layers of comic content, tried in order by the reader:

1. **IPFS bundle** — the original interactive comic (if any gateway still
   has it). Public, can disappear if unpinned.
2. **Supabase webp pages** — the owner-gated fallback you upload. Private,
   reliable, but lives on our infra.
3. **Arweave** — a *permanent, pay-once* copy of each page. The reader
   auto-falls back to it if the Supabase image fails.

The Arweave layer is **built and wired but inert** until you provide a
wallet key. Nothing breaks before then.

## What's in the code

- `src/lib/arweave/index.ts` — an **independent, reusable** module
  (`arweavePut`, `arweaveUrl`, `arweaveConfigured`, `arweavePriceAR`). No
  coupling to comics — copy it straight into the Kinetink app or anywhere.
  Flexible by design: every upload takes free-form tags and the caller
  decides what variant it is, so the same module handles
  `full` / `highres` / `lowres` / `thumb` / `atlas` / future variants.
- `POST /api/comics/arweave` (admin) — downloads each page from the
  private bucket and mirrors it to Arweave, recording the tx id in
  `comics.pages[i].ar.<variant>`. Re-runnable (skips already-mirrored).
- `/api/comic-pages` now also returns each page's Arweave URL; the reader
  uses it automatically if the Supabase image errors.
- Reader toolbar (admin): an **"Arweave"** button runs the mirror for the
  open comic.

No DB migration needed — `ar` is just extra keys inside the existing
`comics.pages` JSON. Variants are independent keys, e.g.:

```json
{ "label": "1", "file": "1.webp",
  "ar": { "full": "<txid>", "thumb": "<txid>", "atlas": "<txid>" } }
```

## What YOU need to do (when ready)

1. **Make an Arweave wallet** (a JWK key file):
   - Easiest: <https://arweave.app> → create wallet → export the **JWK
     JSON** (keep it secret — it controls the funds).
   - Or `npm i -g arweave` then generate one, or use ArDrive/Turbo.
2. **Fund it.** Storage is pay-once, permanent. Options:
   - Buy a small amount of **AR** and send to the wallet address, or
   - Use **Turbo/ArDrive credits** (pay with card) — note: Turbo needs a
     small code change to the module's transport; tell me if you go that
     route and I'll add a Turbo provider to the same module.
   - Cost is tiny for webp pages (a full comic is typically a few cents to
     a couple dollars total). The admin button reports counts; the module
     also exposes `arweavePriceAR(bytes)` for an estimate.
3. **Add the env var** (server-side only, NOT `NEXT_PUBLIC`): set
   `ARWEAVE_JWK` to the **stringified JWK JSON** in Vercel (Production).
   Optional: `ARWEAVE_GATEWAY` (default `https://arweave.net`).
4. **Install the package** (the one dependency this needs): `npm i arweave`
   (pure JS, no native postinstall — safe with the repo's
   `ignore-scripts=true`). I deliberately did **not** add it unilaterally
   given this repo's supply-chain history — your call to install.
5. Redeploy. Then per comic, as admin in the reader, click **Arweave** (or
   call `POST /api/comics/arweave` with `{ cid, variant }`). Run once per
   variant you want (`full` now; `thumb`/`lowres`/`atlas` later once those
   images exist).

## Variants / flexibility

`arweavePut(bytes, contentType, tags)` is generic. The comics route
mirrors the current webp as variant `full`. To add other variants later
(e.g. a low-res or a thumbnail texture-atlas), generate those images
(client-side canvas, like the WEBP convert, or an offline tool), upload
them, and call the backfill with that `variant` name — they're stored as
independent `ar.<variant>` tx ids and any consumer (reader, Kinetink,
a game texture loader) can pick whichever it wants.

## Reuse in Kinetink / elsewhere

`src/lib/arweave/index.ts` has zero app dependencies. Copy it, set
`ARWEAVE_JWK`, `import { arweavePut, arweaveUrl } from '.../arweave'`, and
store whatever you want with tags. The tx id / URL is permanent.
