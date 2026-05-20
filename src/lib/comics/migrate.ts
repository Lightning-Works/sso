/**
 * One-time migration of per-mint comic fallback rows to type-level cids.
 *
 * Background: ComicReader synthesizes a cid from the NFT name when the
 * animation_url has no real IPFS CID. The original scheme included the
 * trailing mint number, so every mint of the same comic type got its own
 * row + storage prefix (e.g. "lwaw0starblind267" for "AW0 Starblind #267").
 * We now strip the mint number so every mint shares one row
 * ("lwaw0starblind"). This helper, called from the read/write API routes,
 * detects legacy rows and consolidates them into the type-level row the
 * first time the new cid is touched. Files in storage are moved (not
 * copied — bandwidth is free for renames, and we don't want orphans).
 *
 * Idempotent: if the target row already exists OR no legacy rows match,
 * it returns the existing row unchanged. Safe to call from every API
 * entrypoint that takes a cid.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface Page { label: string; file?: string; ar?: Record<string, string> }
interface ComicRow { cid: string; name: string | null; pages: Page[] | null; updated_at?: string | null }

const COMIC_PAGES_BUCKET = 'comic_pages'

export async function migrateLegacyComic(
  db: SupabaseClient,
  cid: string,
): Promise<ComicRow | null> {
  // 1. If the target type-level row already exists, nothing to do.
  const { data: existing } = await db.from('comics')
    .select('cid, name, pages, updated_at').eq('cid', cid).maybeSingle()
  if (existing) return existing as ComicRow

  // 2. Only the synthetic "lw…" prefix is migratable; real IPFS CIDs are
  //    fixed-length and already shared across mints, so leave them alone.
  if (!cid.startsWith('lw')) return null

  // 3. Find candidate legacy rows: same prefix + an all-digits suffix
  //    (the stripped mint number). Postgres ~ is a regex match.
  const { data: candidates } = await db.from('comics')
    .select('cid, name, pages, updated_at')
    .like('cid', `${cid}%`)
  if (!candidates?.length) return null
  const re = new RegExp(`^${cid}\\d+$`)
  const matches = (candidates as ComicRow[]).filter(r => re.test(r.cid))
  if (!matches.length) return null

  // 4. Pick the best candidate: most pages first, then most recent. Other
  //    legacy rows (e.g. someone uploaded a stub on another mint) are left
  //    alone — we don't want to silently lose data by merging them.
  matches.sort((a, b) => {
    const pa = (a.pages?.length || 0), pb = (b.pages?.length || 0)
    if (pa !== pb) return pb - pa
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  })
  const src = matches[0]

  // 5. Move every storage file from "<oldCid>/" to "<newCid>/". Listing
  //    only returns one page (~100 entries) by default — plenty for any
  //    realistic comic (single bundle, < 20 pages).
  const { data: files } = await db.storage.from(COMIC_PAGES_BUCKET).list(src.cid)
  for (const f of files || []) {
    if (!f.name) continue
    await db.storage.from(COMIC_PAGES_BUCKET)
      .move(`${src.cid}/${f.name}`, `${cid}/${f.name}`)
      .catch(() => { /* already moved (re-entry) — fine */ })
  }

  // 6. Insert the new type-level row, then drop the legacy one. Done in
  //    that order so a crash between steps still leaves the data readable.
  const target: ComicRow = {
    cid,
    name: (src.name || '').replace(/\s*#?\s*\d+\s*$/, '').trim() || src.name,
    pages: src.pages,
    updated_at: new Date().toISOString(),
  }
  const { data: inserted, error: upErr } = await db.from('comics')
    .upsert(target, { onConflict: 'cid' }).select().single()
  if (upErr) return null
  try { await db.from('comics').delete().eq('cid', src.cid) } catch { /* ignore */ }

  return inserted as ComicRow
}
