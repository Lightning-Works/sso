-- ============================================
-- Theme System Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Add theme JSONB column to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}';

-- Add theme JSONB column to apps table
ALTER TABLE apps
ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}';

-- Migrate existing primary_color into the theme JSON for any companies that have one set
UPDATE companies
SET theme = jsonb_build_object('primary_color', primary_color)
WHERE primary_color IS NOT NULL
  AND primary_color != '#6a24fa'
  AND (theme IS NULL OR theme = '{}');

-- Example: Set Anamaya theme
-- UPDATE companies SET theme = '{
--   "primary_color": "#A35B4E",
--   "primary_hover_color": "#8A4D42",
--   "bg_color": "#FFFFFF",
--   "panel_bg_color": "rgba(245, 247, 237, 0.95)",
--   "text_color": "#333333",
--   "text_secondary_color": "#666666",
--   "input_bg_color": "#F5F7ED",
--   "input_text_color": "#333333",
--   "divider_color": "#9CB5B1",
--   "border_radius": "5px",
--   "font_family": "'Open Sans', sans-serif",
--   "font_size": "16px"
-- }'::jsonb
-- WHERE slug = 'anamaya';
