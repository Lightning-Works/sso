# Agent brief: Solana cNFT lane (minting service in LW-SSO)

Posted 2026-08-21 by the Solana/cNFT lane so other agents working on `~/sso` know
what's coming and what it touches. Full design: `/Users/geoffreymccabe/DIVIGO-SSO-CNFT-PLAN.md`.

## What I'm building
A Solana **compressed-NFT (cNFT) minting + transfer-building service** inside SSO, so
games can mint reward cNFTs and the DiviGo wallet can move them. SSO becomes the one
place that mints; DiviGo holds user keys and signs transfers (SSO never holds user
keys). Decided with Geoff: one Merkle tree per game/collection; games call SSO's mint
endpoint directly; the SSO↔DiviGo user link is the existing `divigo_links` table; no
HMAC receipt in v1.

## Coordination / isolation (IMPORTANT)
- SSO is currently on branch **`feature/agent-eligibility`** with UNCOMMITTED work
  (another lane). **I will NOT touch that branch or its files** — including the
  untracked items I see (`.npmrc`, `DiviGo-api-master*`, `DiviGoReboot-main*`,
  `docs/DIVIGO-MALWARE-REPORT.md`, `docs/SECURITY-INCIDENT-REPORT.md`, `img/*.mp4`).
- I'll work in an **isolated git worktree** on branch **`feature/solana-cnft`** so we
  don't collide. If you need me to pause or hand off, this brief is the contact point.
- Reminder from `AGENTS.md`: this is **Next.js 16** with breaking changes — I'll read
  `node_modules/next/dist/docs/` before writing route code.

## What this adds (almost all NEW files — low collision surface)
NEW:
- `src/app/api/solana/create-tree/route.ts` (admin, one-time per collection)
- `src/app/api/solana/mint-cnft/route.ts` (server-to-server, `X-LW-Mint-Secret`)
- `src/app/api/solana/build-cnft-transfer/route.ts` (returns an UNSIGNED tx; DiviGo signs)
- `src/lib/solana/mint.ts`, `src/lib/solana/transfer.ts`
- `docs/cnft-tables.sql` (Supabase: `cnft_trees`, `cnft_collections`, `cnft_mints`;
  mirrors `docs/lw-nft-tables.sql`, RLS: public read / service-role write)
- `docs/SOLANA_MINT_SETUP.md` (new secrets doc)

TOUCHES (existing — additive; flag me if you're mid-edit on these):
- `package.json` — adds `@metaplex-foundation/umi-bundle-defaults`, `mpl-bubblegum`,
  `mpl-token-metadata` (~130 transitive pkgs; provenance-vetted; Vercel cloud-build).
- May reuse (read-only) `src/lib/blockchain/rpc.ts` (Helius RPC) — no edits expected.

## New env/secrets (Vercel, server-only, never NEXT_PUBLIC)
- `SOLANA_MINT_AUTHORITY_SECRET` — the mint-authority keypair. **SSO's first private
  key** (previously non-custodial). Least-privilege: can mint into our trees only,
  cannot move users' assets.
- `SOLANA_MINT_SERVICE_SECRET` — shared secret for the mint/transfer endpoints
  (header `X-LW-Mint-Secret`), separate from the read-only `LW_HOLDINGS_SECRET`.

## Auth pattern I'm mirroring
`src/app/api/app/connected-wallets/route.ts` — `constEq` constant-time compare of a
header secret. Destination resolution reuses `divigo_links` (see
`src/app/api/oauth/divigo/request-transfer/route.ts`).

## Testing
cNFT mint + transfer are **devnet-testable** — I'll prove the full lifecycle on
devnet before any mainnet/live use. Nothing goes live without Geoff's go-ahead
(mint-authority key + deploy is a deliberate step).
