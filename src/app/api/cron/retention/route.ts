/**
 * GET /api/cron/retention  (Authorization: Bearer <CRON_SECRET>)
 * Deletes SSO-held optional data past its retention window. Erasable categories are
 * hard-deleted by cutoff; regulated/retained categories are left to each owning
 * system's schema-specific anonymization (reported, not blind-wiped here).
 */
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { DATA_CATEGORIES } from '@/lib/compliance/dataCategories'
import { DAY_MS } from '@/lib/compliance/retention'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') || ''
  if (auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  )
  const now = Date.now()
  const swept: Array<{ category: string; table: string; before: string }> = []
  const delegated: string[] = []
  const errors: Array<{ table: string; error: string }> = []

  for (const cat of Object.values(DATA_CATEGORIES) as Array<Record<string, unknown>>) {
    if (cat.retentionDays == null) continue // no fixed window
    const cutoffISO = new Date(now - (cat.retentionDays as number) * DAY_MS).toISOString()
    const tables = (cat.stores as string[]).filter((s) => s.startsWith('sso.supabase.')).map((s) => s.replace('sso.supabase.', ''))
    for (const table of tables) {
      if (!cat.erasable) { delegated.push(cat.id + ':' + table); continue } // regulated -> owning system anonymizes
      const { error } = await db.from(table).delete().lt('created_at', cutoffISO)
      if (error) errors.push({ table, error: error.message })
      else swept.push({ category: cat.id as string, table, before: cutoffISO })
    }
  }
  return NextResponse.json({ ok: errors.length === 0, swept, delegated, errors, ranAt: new Date().toISOString() })
}
