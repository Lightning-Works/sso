# LightningWorks SSO — API Reference

**Base URL:** `https://sso.lightningworks.io`

All API endpoints accept and return JSON. CORS is enabled on public endpoints.

---

## Authentication

### POST `/api/verify` — Verify User Token

Verifies a JWT token from SSO login. Used by external apps to validate users.

**CORS:** Enabled (all origins)

**Request:**
```json
{
  "token": "eyJhbGciOi..."
}
```

**Response (200):**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "player@email.com",
    "username": "gandalfskywalker",
    "display_name": "GandalfSkywalker",
    "role": "user",
    "avatar_url": "https://...",
    "avatar_outer_color": "#ff6600",
    "avatar_inner_color": "#3366ff",
    "avatar_pan_x": 0.5,
    "avatar_pan_y": 0.5,
    "avatar_zoom": 1.0,
    "created_at": "2026-03-19T...",
    "last_sign_in": "2026-03-19T..."
  }
}
```

**Error (401):** `{ "error": "Invalid token" }`

---

## User Data

### GET `/api/user/profile` — Get User Profile

**Query Parameters:** `username=xxx` OR `id=uuid` (one required)

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "gandalfskywalker",
    "display_name": "GandalfSkywalker",
    "avatar_url": "https://...",
    "created_at": "2026-03-19T..."
  }
}
```

### GET `/api/user/wallets` — Get User's Connected Wallets

Returns all connected wallet addresses across EVM (Ethereum, Polygon, Base, Core, SKALE), Solana, and WAX.

**Query Parameters:** `username=xxx` OR `id=uuid` (one required)

**Response (200):**
```json
{
  "user_id": "uuid",
  "wallets": [
    {
      "chain_type": "evm",
      "wallet_provider": "metamask",
      "wallet_address": "0x1a2b...3c4d",
      "connected_at": "2026-03-19T..."
    },
    {
      "chain_type": "solana",
      "wallet_provider": "phantom",
      "wallet_address": "7Xf2...9kL",
      "connected_at": "2026-03-19T..."
    },
    {
      "chain_type": "wax",
      "wallet_provider": "wax",
      "wallet_address": "phmo4.c.wam",
      "connected_at": "2026-03-19T..."
    }
  ],
  "count": 3
}
```

### GET `/api/user/balances` — Get Live Token Balances

Fetches live token balances from all connected wallets. May take 2-5 seconds.

**Query Parameters:** `username=xxx` OR `id=uuid` (one required)

**Response (200):**
```json
{
  "user_id": "uuid",
  "wallets": 2,
  "balances": [
    { "symbol": "SOL", "name": "Solana", "balance": "12.5000", "chain": "solana", "wallet_address": "7Xf2...9kL" },
    { "symbol": "ETH", "name": "Ethereum", "balance": "0.4200", "chain": "evm", "wallet_address": "0x1a2b...3c4d" },
    { "symbol": "WAX", "name": "WAX Token", "balance": "1500.0000", "chain": "wax", "wallet_address": "phmo4.c.wam" },
    { "symbol": "TLM", "name": "Trilium", "balance": "25000.0000", "chain": "wax", "wallet_address": "phmo4.c.wam" }
  ]
}
```

---

## Token Gating

### POST `/api/gate` — Evaluate Token Gate Rules

Checks whether a user's connected wallets satisfy one or more token gating rules. Supports EVM tokens, Solana tokens, WAX tokens, NFT ownership, NFT traits, collection counts, and custom tokens on any EVM chain.

**CORS:** Enabled (all origins)

**Request:**
```json
{
  "token": "jwt-token",
  "rules": [ ... ]
}
```

User can be identified by one of:
- `"token": "jwt-token"` — JWT from SSO login
- `"user_id": "uuid"` — direct user ID
- `"username": "gandalfskywalker"` — username lookup

**Response (200):**
```json
{
  "user_id": "uuid",
  "pass": true,
  "results": [
    { "rule": "token_balance", "pass": true, "balance": 150000, "detail": "150000 TLM (required: 100000)" },
    { "rule": "nft_ownership", "pass": true, "detail": "NFT found" }
  ]
}
```

`pass` is `true` only if ALL rules pass. Each rule returns its own result with details.

---

### Rule Types

#### 1. `token_balance` — Minimum Token Balance

Check if the user holds a minimum amount of a token.

**Native tokens (ETH, SOL, WAX):**
```json
{
  "type": "token_balance",
  "chain": "evm",
  "symbol": "ETH",
  "min_balance": 0.1
}
```

**ERC-20 / SPL tokens:**
```json
{
  "type": "token_balance",
  "chain": "evm",
  "symbol": "USDC",
  "contract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "decimals": 6,
  "min_balance": 100,
  "evm_chain": "ethereum"
}
```

**WAX tokens:**
```json
{
  "type": "token_balance",
  "chain": "wax",
  "symbol": "TLM",
  "contract": "alien.worlds",
  "min_balance": 100000
}
```

**Solana SPL tokens:**
```json
{
  "type": "token_balance",
  "chain": "solana",
  "symbol": "BONK",
  "contract": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "min_balance": 1000000
}
```

**Supported `evm_chain` values:** `ethereum`, `polygon`, `base`, `bsc`, `arbitrum`, `optimism`

---

#### 2. `custom_token` — Any Token on Any Chain

For tokens not in our default chain list. Provide your own RPC URL.

```json
{
  "type": "custom_token",
  "chain": "evm",
  "rpc_url": "https://rpc.ankr.com/avalanche",
  "token_address": "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
  "token_symbol": "WETH.e",
  "decimals": 18,
  "min_balance": 0.5
}
```

Works with any EVM-compatible chain or Solana SPL token. Just provide the RPC URL.

---

#### 3. `nft_ownership` — Owns Any NFT from a Collection

Returns true if the user owns at least one NFT from the specified collection.

**EVM:**
```json
{
  "type": "nft_ownership",
  "chain": "evm",
  "collection": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "evm_chain": "ethereum"
}
```

**Solana (by collection address):**
```json
{
  "type": "nft_ownership",
  "chain": "solana",
  "collection": "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w"
}
```

**WAX (by collection name + optional schema):**
```json
{
  "type": "nft_ownership",
  "chain": "wax",
  "collection": "alien.worlds",
  "schema": "land.worlds"
}
```

---

#### 4. `nft_trait` — Owns NFT with Specific Trait

Check if the user owns an NFT from a collection with a specific attribute/trait value.

```json
{
  "type": "nft_trait",
  "chain": "evm",
  "collection": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "evm_chain": "ethereum",
  "trait_type": "Background",
  "trait_value": "Blue"
}
```

Omit `trait_value` to check if the trait exists with ANY value:
```json
{
  "type": "nft_trait",
  "chain": "wax",
  "collection": "alien.worlds",
  "schema": "tool.worlds",
  "trait_type": "rarity",
  "trait_value": "Legendary"
}
```

---

#### 5. `nft_collection_count` — Minimum NFTs from a Collection

Check if the user owns a minimum number of NFTs from a collection. Useful for "complete set" requirements.

```json
{
  "type": "nft_collection_count",
  "chain": "solana",
  "collection": "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w",
  "min_count": 5
}
```

**WAX example — owns 3+ land plots:**
```json
{
  "type": "nft_collection_count",
  "chain": "wax",
  "collection": "alien.worlds",
  "schema": "land.worlds",
  "min_count": 3
}
```

---

### Combining Multiple Rules

All rules must pass for the overall `pass` to be `true`. This lets you create complex gates:

**Example: VIP access requires ETH + specific NFT + minimum token balance:**
```json
{
  "token": "user-jwt-token",
  "rules": [
    {
      "type": "token_balance",
      "chain": "evm",
      "symbol": "ETH",
      "min_balance": 0.01,
      "evm_chain": "ethereum"
    },
    {
      "type": "nft_ownership",
      "chain": "evm",
      "collection": "0x1234...5678",
      "evm_chain": "polygon"
    },
    {
      "type": "token_balance",
      "chain": "wax",
      "symbol": "TLM",
      "contract": "alien.worlds",
      "min_balance": 100000
    }
  ]
}
```

**Response:**
```json
{
  "user_id": "uuid",
  "pass": false,
  "results": [
    { "rule": "token_balance", "pass": true, "balance": 0.42, "detail": "0.42 ETH (required: 0.01)" },
    { "rule": "nft_ownership", "pass": true, "detail": "NFT found" },
    { "rule": "token_balance", "pass": false, "balance": 50000, "detail": "50000 TLM (required: 100000)" }
  ]
}
```

---

## Wallet Portfolio Pages

Users can view their full token and NFT portfolios at these URLs:

| Chain | URL Pattern | Supported Chains |
|-------|-------------|------------------|
| EVM | `/wallet/evm?address={address}` | Ethereum, Polygon, Base, Core, SKALE Nebula |
| Solana | `/wallet/solana?address={address}` | Solana (regular + compressed NFTs) |
| WAX | `/wallet/wax?account={account}` | WAX (AtomicAssets NFTs, syndicate tokens) |

Each wallet page displays:
- Token balances with USD values (CoinGecko + DexScreener prices)
- Token logos (coin-logos CDN + Helius metadata)
- NFT grid with search, spam filtering, favorites
- NFT detail lightbox with attributes, rarity, external links

---

## WAX-Specific Features

### GET `/api/planet?index={0-5}` — Planet Governance Data

Returns Alien Worlds DAO governance data for a specific planet.

**Planets:** 0=Eyeke, 1=Kavian, 2=Magor, 3=Naron, 4=Neri, 5=Veles

**Response includes:** custodians, candidates, election cycle, staking config, token supply, proposal budgets.

---

## NFT Management

### GET `/api/nft-blacklist` — Get Global NFT Blacklist

Returns NFT IDs blacklisted by superadmins (spam NFTs hidden for all users).

### POST `/api/nft-blacklist` — Add to Blacklist (Superadmin)

### DELETE `/api/nft-blacklist` — Remove from Blacklist (Superadmin)

### POST `/api/nft-thumbs` — Generate NFT Thumbnails

Generates and caches WebP thumbnails (max 800px) in Supabase storage for faster grid loading.

---

## Admin

### GET `/api/admin/logs` — Audit Logs (Superadmin)

Search and filter all audit events. Supports full-text search, category/type filtering, date ranges, pagination.

### POST `/api/mfa-backup` — MFA Recovery

Disable 2FA using a backup code for account recovery.

---

## Integration Flow

### For External Apps (Games, Websites)

1. Redirect user to `https://sso.lightningworks.io/login?app={slug}&redirect={your_callback_url}`
2. User authenticates (Google, Discord, email, WAX Cloud Wallet)
3. SSO redirects back: `{your_callback_url}#access_token={jwt}&refresh_token={rt}&token_type=bearer`
4. Your app calls `POST /api/verify` with the token to get user info
5. Your app calls `POST /api/gate` with rules to check token/NFT requirements
6. Your app calls `GET /api/user/wallets` or `GET /api/user/balances` for wallet data

### Token Gating Quick Start

```javascript
// After verifying the user's token
const gateResponse = await fetch('https://sso.lightningworks.io/api/gate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: userJwtToken,
    rules: [
      { type: 'nft_ownership', chain: 'evm', collection: '0xYourContract', evm_chain: 'polygon' },
      { type: 'token_balance', chain: 'solana', symbol: 'SOL', min_balance: 1.0 }
    ]
  })
})
const { pass, results } = await gateResponse.json()
if (pass) {
  // User meets all requirements — grant access
} else {
  // Show which requirements failed
  results.filter(r => !r.pass).forEach(r => console.log(r.detail))
}
```
