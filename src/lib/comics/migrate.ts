/**
 * One-time migration of older comic fallback rows to the current cid scheme.
 *
 * Background: ComicReader synthesizes a storage cid from the NFT identity
 * when the animation_url has no real IPFS CID. The scheme has evolved:
 *
 *   v1  per-mint name      e.g. "lwaw0starblind267"   (each mint isolated)
 *   v2  type-level name    e.g. "lwaw0starblind"      (mints share by name)
 *   v3  contract address   e.g. "lwabcd…ef12"         (mints share by chain id, the immutable identifier)
 *
 * On every read/write the API calls this helper with the CURRENT (v3)
 * cid plus a name hint. If a v3 row already exists, return it. Otherwise
 * look for older candidates — v2 rows derived from the stripped name,
 * and v1 rows that are v2 + a trailing digit suffix — and consolidate
 * the best one into the v3 row. Storage files are renamed (Supabase
 * `move`), not copied. Done in the order insert→delete so a crash
 * mid-migration still leaves the data readable.
 *
 * Idempotent: if the target row already exists OR no legacy candidates
 * match, it returns the existing row (or null) unchanged.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface Page { label: string; file?: string; ar?: Record<string, string>; tier?: string; section?: string }
interface ComicRow { cid: string; name: string | null; pages: Page[] | null; updated_at?: string | null; format?: string | null }

const COMIC_PAGES_BUCKET = 'comic_pages'

function nameToLegacyCid(name?: string | null): string | null {
  if (!name) return null
  const stripped = name.replace(/\s*#?\s*\d+\s*$/, '').trim()
  if (!stripped) return null
  const seed = stripped.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 46)
  return seed ? 'lw' + seed : null
}

async function findLegacyMatches(
  db: SupabaseClient,
  prefix: string,
): Promise<ComicRow[]> {
  // Exact match (v2: type-level name key) + prefix+digit-suffix matches
  // (v1: per-mint name key). One DB round-trip via LIKE, then filter.
  const { data } = await db.from('comics')
    .select('*')
    .like('cid', `${prefix}%`)
  if (!data?.length) return []
  const exact = new RegExp(`^${prefix}$`)
  const perMint = new RegExp(`^${prefix}\\d+$`)
  return (data as ComicRow[]).filter(r => exact.test(r.cid) || perMint.test(r.cid))
}

function bestCandidate(rows: ComicRow[]): ComicRow | null {
  if (!rows.length) return null
  // Most pages first, then most recent.
  const sorted = [...rows].sort((a, b) => {
    const pa = (a.pages?.length || 0), pb = (b.pages?.length || 0)
    if (pa !== pb) return pb - pa
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  })
  return sorted[0]
}

async function moveStoragePrefix(
  db: SupabaseClient,
  fromCid: string,
  toCid: string,
): Promise<void> {
  const { data: files } = await db.storage.from(COMIC_PAGES_BUCKET).list(fromCid)
  for (const f of files || []) {
    if (!f.name) continue
    await db.storage.from(COMIC_PAGES_BUCKET)
      .move(`${fromCid}/${f.name}`, `${toCid}/${f.name}`)
      .catch(() => { /* already moved on a previous run — fine */ })
  }
}

export async function migrateLegacyComic(
  db: SupabaseClient,
  cid: string,
  nameHint?: string | null,
): Promise<ComicRow | null> {
  // 1. Target (v3) row already there → done.
  const { data: existing } = await db.from('comics')
    .select('*').eq('cid', cid).maybeSingle()
  if (existing) return existing as ComicRow

  // 2. Only synthetic "lw…" cids are migratable; real IPFS CIDs are
  //    fixed and already shared across mints.
  if (!cid.startsWith('lw')) return null

  // 3. Gather candidates. Pool all legacy prefixes the data could live
  //    under: (a) the v3 cid itself with a digit suffix (per-mint
  //    contract-address rows — unlikely but cheap to check); (b) the v2
  //    name-derived cid and its v1 per-mint variants.
  const candidates: ComicRow[] = []
  candidates.push(...await findLegacyMatches(db, cid))
  const legacyPrefix = nameToLegacyCid(nameHint)
  if (legacyPrefix && legacyPrefix !== cid) {
    candidates.push(...await findLegacyMatches(db, legacyPrefix))
  }
  const best = bestCandidate(candidates)
  if (!best) return null

  // 4. Migrate storage files + DB row from best.cid → cid.
  await moveStoragePrefix(db, best.cid, cid)
  const target: ComicRow = {
    cid,
    name: (best.name || '').replace(/\s*#?\s*\d+\s*$/, '').trim() || best.name,
    pages: best.pages,
    updated_at: new Date().toISOString(),
  }
  const { data: inserted, error } = await db.from('comics')
    .upsert(target, { onConflict: 'cid' }).select().single()
  if (error) return null
  try { await db.from('comics').delete().eq('cid', best.cid) } catch { /* ignore */ }

  return inserted as ComicRow
}
