# cNFT module (portable)

The single place that mints and moves Solana compressed NFTs (cNFTs) for the whole
ecosystem. Self-contained: nothing in this folder imports the host app, so it can be
copied to another Node app (a standalone service, GoBanq, etc.) unchanged.

## Public API (`import ... from '@/lib/solana'`)
- `createCollectionTree({ maxDepth?, maxBufferSize?, canopyDepth? })` -> `{ treeAddress, signature }`
  Run once per game/collection. Needs the mint-authority secret.
- `mintCnft({ treeAddress, recipient, name, uri, sellerFeeBasisPoints? })` -> `{ assetId, signature }`
  Mints a cNFT to `recipient`. Needs the mint-authority secret.
- `buildCnftTransfer({ assetId, from, to, feePayer? })` -> `{ transaction (base64 UNSIGNED), ... }`
  Builds an unsigned transfer. Needs NO secret. The wallet that holds the user's key
  signs and broadcasts it (SSO/host never holds user keys).

## Environment
- `SOLANA_RPC` (optional): explicit RPC URL. If unset, built from the Helius key below.
- `HELIUS_API_KEY` or `NEXT_PUBLIC_HELIUS_API_KEY`: used to build a mainnet Helius URL.
- `SOLANA_MINT_AUTHORITY_SECRET`: the mint-authority keypair (base58 string OR JSON
  byte array). Required for minting only; the transfer builder does not use it.

## What is NOT in this folder (host-specific, re-create per host)
- The HTTP routes that expose these functions (`src/app/api/solana/*` in this app).
- Any database recording of trees/mints (this app records to Supabase at the route
  layer). The on-chain tx signature is always the source of truth.

## To move it elsewhere
1. Copy this folder into the target app.
2. Set the env values above.
3. Add thin routes (or direct calls) in the new host; re-create the recording tables
   if you want a DB record. Nothing inside the folder changes.

## Status
Full lifecycle (create tree -> mint -> transfer, including the host-builds /
wallet-signs split) proven on devnet 2026-09-15.
