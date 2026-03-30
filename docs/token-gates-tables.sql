-- Token Gates
CREATE TABLE IF NOT EXISTS token_gates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  app_slug text NOT NULL,
  display_id text NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(app_slug, display_id)
);

CREATE INDEX IF NOT EXISTS idx_gates_app ON token_gates(app_slug);

ALTER TABLE token_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read gates" ON token_gates FOR SELECT USING (true);
CREATE POLICY "Service role can manage gates" ON token_gates FOR ALL USING (true) WITH CHECK (true);

-- Token Gate Rules
CREATE TABLE IF NOT EXISTS token_gate_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_id uuid NOT NULL REFERENCES token_gates(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  chain text,
  evm_chain text,
  source text DEFAULT 'other',
  collection_address text,
  symbol text,
  contract text,
  trait_type text,
  trait_value text,
  operator text NOT NULL DEFAULT 'must_have',
  amount numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_rules_gate ON token_gate_rules(gate_id);

ALTER TABLE token_gate_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rules" ON token_gate_rules FOR SELECT USING (true);
CREATE POLICY "Service role can manage rules" ON token_gate_rules FOR ALL USING (true) WITH CHECK (true);
