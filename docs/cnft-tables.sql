-- Solana compressed-NFT (cNFT) registry for LW-SSO.
-- Mirrors docs/lw-nft-tables.sql conventions: public read, service-role write.
-- Run once in the Supabase SQL editor. Design: DIVIGO-SSO-CNFT-PLAN.md.

-- One Merkle tree per game/collection. Created once via /api/solana/create-tree.
CREATE TABLE IF NOT EXISTS cnft_trees (
  id serial PRIMARY KEY,
  tree_address text NOT NULL UNIQUE,
  app text DEFAULT '',
  name text DEFAULT '',
  max_depth int,
  max_buffer_size int,
  canopy_depth int,
  capacity int,
  create_signature text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cnft_trees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cnft trees"
  ON cnft_trees FOR SELECT USING (true);

CREATE POLICY "Service role can write cnft trees"
  ON cnft_trees FOR ALL
  USING (true) WITH CHECK (true);


-- Collections (optional grouping/metadata over a tree). One tree may host one
-- logical collection in v1 (one tree per game/collection).
CREATE TABLE IF NOT EXISTS cnft_collections (
  id serial PRIMARY KEY,
  name text NOT NULL,
  app text DEFAULT '',
  tree_address text REFERENCES cnft_trees(tree_address) ON DELETE SET NULL,
  collection_mint text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cnft_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cnft collections"
  ON cnft_collections FOR SELECT USING (true);

CREATE POLICY "Service role can write cnft collections"
  ON cnft_collections FOR ALL
  USING (true) WITH CHECK (true);


-- Every mint recorded (source of truth is still the on-chain tx signature).
CREATE TABLE IF NOT EXISTS cnft_mints (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL,
  tree_address text,
  recipient_address text NOT NULL,
  name text DEFAULT '',
  uri text DEFAULT '',
  app text DEFAULT '',
  user_ref text DEFAULT '',
  tx_sig text,
  status text DEFAULT 'confirmed',
  minted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnft_mints_recipient ON cnft_mints(recipient_address);
CREATE INDEX IF NOT EXISTS idx_cnft_mints_asset ON cnft_mints(asset_id);
CREATE INDEX IF NOT EXISTS idx_cnft_mints_tree ON cnft_mints(tree_address);

ALTER TABLE cnft_mints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cnft mints"
  ON cnft_mints FOR SELECT USING (true);

CREATE POLICY "Service role can write cnft mints"
  ON cnft_mints FOR ALL
  USING (true) WITH CHECK (true);
