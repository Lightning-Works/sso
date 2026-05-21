-- Per-comic fallback: page-name JSON + uploaded webp page images.
-- A comic is keyed by its IPFS bundle CID (parsed from the NFT's
-- animation_url). The Reader uses the IPFS bundle if any gateway still
-- has it; otherwise it falls back to these uploaded page images.
--
-- ACCESS: the fallback images are PRIVATE. They are only served (as
-- short-lived signed URLs) to a logged-in user who OWNS an NFT of that
-- comic, via /api/comic-pages. The bucket is NOT public.
--
-- Launched comics' CIDs (today there are two):
--   QmQJvB5EKVEWqX93wmxgVGGNYXiB9RnexYdKw43LAmbxUu  (Siege Worlds Zero — Common)
--   QmcsVBicJtWk3TfUH83srk2Vrfa9ykrbxgPBgjUAwLp55x  (LightningWorks Portal genesis)

create table if not exists comics (
  cid        text primary key,            -- IPFS bundle CID = the comic key
  name       text not null default '',
  pages      jsonb not null default '[]', -- ORDERED: [{ "label","file","tier?","section?" }]
  format     text not null default 'pages', -- 'pages' (book reader) | 'webtoon' (vertical scroll)
  updated_at timestamptz not null default now()
);

-- If the comics table already exists from an earlier deploy, add the
-- webtoon-format column (safe to run repeatedly):
alter table comics add column if not exists format text not null default 'pages';

-- RLS on; NO public/anon policy. All access is via the server (service
-- role) endpoints which enforce ownership / admin.
alter table comics enable row level security;

-- PRIVATE bucket for fallback page images. Upload one folder per comic
-- CID:  comic_pages/<cid>/<file>   e.g. comic_pages/QmQJ.../cover.webp
insert into storage.buckets (id, name, public)
values ('comic_pages', 'comic_pages', false)
on conflict (id) do update set public = false;

-- Remove any prior public-read policy for this bucket (it must stay
-- private; objects are reached only through signed URLs minted server-side
-- after an ownership check).
drop policy if exists "comic_pages public read" on storage.objects;

-- ── Per-comic template — run one INSERT per comic ────────────────────
-- "label" = the page name shown on the button (COVER, L1, AD1, 1, 2, BC…)
-- "file"  = the webp object you upload to comic_pages/<cid>/<file>
-- Order of the array = page order in the reader.
insert into comics (cid, name, pages) values
(
  'QmQJvB5EKVEWqX93wmxgVGGNYXiB9RnexYdKw43LAmbxUu',
  'Siege Worlds Zero — Common',
  '[
     {"label":"COVER","file":"cover.webp"},
     {"label":"L1","file":"l1.webp"},
     {"label":"1","file":"1.webp"},
     {"label":"2","file":"2.webp"},
     {"label":"AD1","file":"ad1.webp"},
     {"label":"BC","file":"bc.webp"}
   ]'::jsonb
)
on conflict (cid) do update
  set name = excluded.name, pages = excluded.pages, updated_at = now();
-- (Repeat the INSERT for QmcsVBic... and any future comic CID.)
