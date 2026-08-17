// Storage + request glue for the compliance engine. The pure logic lives in the
// tested .js modules in this folder; this TS layer connects them to Supabase and
// to the incoming request (region detection, IP-as-proof). Consent writes use the
// service-role client (append-only; RLS lets a user read only their own rows).
//
// Cross-system note: some data categories live in DiviGo (Mongo) or Kinetink, not
// SSO. Those stores are marked "delegated" here so a DSAR response is honest about
// which systems must also act; wiring their delete/anonymize hooks is a follow-up.

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveRegionId } from './regions'
import { getCategory, DATA_CATEGORIES } from './dataCategories'

type AnyRec = Record<string, unknown>

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

// ---- region detection from the request (geo headers, or explicit override) ----
export function detectRegion(request: Request, override?: { country?: string; usState?: string }) {
  const h = request.headers
  const country =
    override?.country ||
    h.get('x-vercel-ip-country') ||
    h.get('cf-ipcountry') ||
    h.get('x-country') ||
    ''
  const usState = override?.usState || h.get('x-vercel-ip-country-region') || h.get('x-us-state') || ''
  return resolveRegionId({ country, usState })
}

export function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || null
}

// ---- consent store (the shape consentService expects) ----
export const consentStore = {
  async saveConsent(record: AnyRec) {
    const db = service()
    const { error } = await db.from('consent_records').insert({
      user_id: record.userId,
      region_id: record.regionId,
      notice_version: record.noticeVersion,
      consent_model: record.consentModel,
      choices: record.choices || {},
      ip: record.ip || null,
      user_agent: record.userAgent || null,
    })
    if (error) throw new Error('consent save failed: ' + error.message)
  },
  async getLatestConsent(userId: string) {
    const db = service()
    const { data, error } = await db
      .from('consent_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error('consent read failed: ' + error.message)
    if (!data) return null
    return {
      userId: data.user_id,
      regionId: data.region_id,
      noticeVersion: data.notice_version,
      consentModel: data.consent_model,
      choices: data.choices || {},
      at: data.created_at,
    }
  },
}

// ---- DSAR adapters (the shape dsarService expects) ----
// sso.supabase.<table> categories are read/deleted here directly; DiviGo-Mongo and
// Kinetink stores are reported as delegated so the response is honest.
function ssoTablesFor(categoryId: string): string[] {
  const cat = getCategory(categoryId)
  if (!cat) return []
  return (cat.stores || [])
    .filter((s: string) => s.startsWith('sso.supabase.'))
    .map((s: string) => s.replace('sso.supabase.', ''))
}
function delegatedStoresFor(categoryId: string): string[] {
  const cat = getCategory(categoryId)
  if (!cat) return []
  return (cat.stores || []).filter((s: string) => !s.startsWith('sso.supabase.'))
}

export const dsarAdapters = {
  async readCategory(categoryId: string, userId: string) {
    const db = service()
    const rows: AnyRec = {}
    for (const table of ssoTablesFor(categoryId)) {
      const { data } = await db.from(table).select('*').eq('user_id', userId)
      rows[table] = data || []
    }
    const delegated = delegatedStoresFor(categoryId)
    return { sso: rows, delegated: delegated.length ? delegated : undefined }
  },
  async deleteCategory(categoryId: string, userId: string) {
    const db = service()
    for (const table of ssoTablesFor(categoryId)) {
      const { error } = await db.from(table).delete().eq('user_id', userId)
      if (error) throw new Error('delete ' + table + ' failed: ' + error.message)
    }
    // delegatedStoresFor(categoryId): DiviGo/Kinetink must also delete — enqueued by the route.
  },
  async anonymizeCategory(categoryId: string, userId: string) {
    // Regulated/retained categories: identifiers are removed by each owning system
    // per its schema (schema-specific), so this is delegated rather than a blind
    // column wipe. The route records the delegation for the receipt.
    return { delegated: (getCategory(categoryId)?.stores as string[]) || [] }
  },
}

export const allCategoryStores = () =>
  Object.values(DATA_CATEGORIES).map((c: AnyRec) => ({ id: c.id, stores: c.stores }))
