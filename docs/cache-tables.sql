-- Token Balances Cache
CREATE TABLE IF NOT EXISTS token_balances_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  chain text NOT NULL,
  chain_key text DEFAULT '',
  symbol text NOT NULL,
  name text DEFAULT '',
  balance text DEFAULT '0',
  decimals int DEFAULT 18,
  contract_address text,
  logo_url text,
  usd_price numeric,
  usd_value numeric,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(wallet_address, chain, symbol)
);

CREATE INDEX IF NOT EXISTS idx_cache_wallet ON token_balances_cache(wallet_address);
CREATE INDEX IF NOT EXISTS idx_cache_updated ON token_balances_cache(updated_at);

ALTER TABLE token_balances_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache"
  ON token_balances_cache FOR SELECT USING (true);

CREATE POLICY "Service role can write cache"
  ON token_balances_cache FOR ALL
  USING (true) WITH CHECK (true);


-- NFT Cache
CREATE TABLE IF NOT EXISTS nft_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  chain text NOT NULL,
  chain_key text DEFAULT '',
  nft_id text NOT NULL,
  name text DEFAULT '',
  collection text DEFAULT '',
  contract_address text DEFAULT '',
  image_url text,
  thumb_url text,
  video_url text,
  description text,
  token_type text DEFAULT '',
  rarity text,
  mint_number text,
  max_supply text,
  floor_price numeric,
  attributes jsonb DEFAULT '[]',
  external_url text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(wallet_address, nft_id)
);

CREATE INDEX IF NOT EXISTS idx_nft_cache_wallet ON nft_cache(wallet_address);
CREATE INDEX IF NOT EXISTS idx_nft_cache_updated ON nft_cache(updated_at);

ALTER TABLE nft_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read nft cache"
  ON nft_cache FOR SELECT USING (true);

CREATE POLICY "Service role can write nft cache"
  ON nft_cache FOR ALL
  USING (true) WITH CHECK (true);
