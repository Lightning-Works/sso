-- LightningWorks NFT Contracts Registry
CREATE TABLE IF NOT EXISTS lw_nft_contracts (
  id serial PRIMARY KEY,
  chain text NOT NULL,
  contract_address text NOT NULL,
  collection_name text NOT NULL,
  symbol text DEFAULT '',
  token_type text DEFAULT 'ERC721',
  total_supply int,
  description text DEFAULT '',
  metadata_base_uri text DEFAULT '',
  last_synced timestamptz,
  nft_count int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lw_nft_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read contracts"
  ON lw_nft_contracts FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage contracts"
  ON lw_nft_contracts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));


-- LightningWorks NFT Data (synced from blockchain)
CREATE TABLE IF NOT EXISTS lw_nft_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id int NOT NULL REFERENCES lw_nft_contracts(id) ON DELETE CASCADE,
  token_id text NOT NULL,
  name text DEFAULT '',
  description text,
  image_url text,
  animation_url text,
  attributes jsonb DEFAULT '[]',
  owner text,
  extra_data jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lw_nft_contract ON lw_nft_data(contract_id);
CREATE INDEX IF NOT EXISTS idx_lw_nft_owner ON lw_nft_data(owner);
CREATE INDEX IF NOT EXISTS idx_lw_nft_token ON lw_nft_data(contract_id, token_id);

ALTER TABLE lw_nft_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read nft data"
  ON lw_nft_data FOR SELECT USING (true);

CREATE POLICY "Service role can write nft data"
  ON lw_nft_data FOR ALL
  USING (true) WITH CHECK (true);
