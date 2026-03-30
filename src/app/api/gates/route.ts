import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) return null
  return user
}

async function getNextDisplayId(db: ReturnType<typeof getServiceDb>, appSlug: string): Promise<string> {
  const { data } = await db
    .from('token_gates')
    .select('display_id')
    .eq('app_slug', appSlug)
    .order('display_id', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'TG0001'
  const last = data[0].display_id
  const num = parseInt(last.replace('TG', ''), 10)
  return `TG${String(num + 1).padStart(4, '0')}`
}

// GET /api/gates?app=kinetink — List all gates for an app
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const appSlug = searchParams.get('app')

  if (!appSlug) {
    return NextResponse.json({ error: 'app query parameter required' }, { status: 400 })
  }

  const db = getServiceDb()
  const { data: gates, error } = await db
    .from('token_gates')
    .select('id, display_id, name, description, is_active, created_at, updated_at')
    .eq('app_slug', appSlug)
    .order('display_id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get rule counts
  const gateIds = (gates || []).map(g => g.id)
  let ruleCounts: Record<string, number> = {}
  if (gateIds.length > 0) {
    const { data: rules } = await db
      .from('token_gate_rules')
      .select('gate_id')
      .in('gate_id', gateIds)
    if (rules) {
      for (const r of rules) {
        ruleCounts[r.gate_id] = (ruleCounts[r.gate_id] || 0) + 1
      }
    }
  }

  const result = (gates || []).map(g => ({
    ...g,
    rule_count: ruleCounts[g.id] || 0,
  }))

  return NextResponse.json({ gates: result }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

// POST /api/gates — Create a new gate
export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = await verifyAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const { app_slug, name, description, rules } = body as {
    app_slug: string; name: string; description?: string; rules?: Record<string, unknown>[]
  }

  if (!app_slug || !name) {
    return NextResponse.json({ error: 'app_slug and name required' }, { status: 400 })
  }

  const db = getServiceDb()

  // Verify app exists
  const { data: app } = await db.from('apps').select('slug').eq('slug', app_slug).single()
  if (!app) return NextResponse.json({ error: `App "${app_slug}" not found` }, { status: 404 })

  const displayId = await getNextDisplayId(db, app_slug)

  const { data: gate, error: gateErr } = await db
    .from('token_gates')
    .insert({ app_slug, display_id: displayId, name, description: description || '' })
    .select()
    .single()

  if (gateErr || !gate) {
    return NextResponse.json({ error: gateErr?.message || 'Failed to create gate' }, { status: 500 })
  }

  // Insert rules
  if (rules && rules.length > 0) {
    const ruleRows = rules.map((r, i) => ({
      gate_id: gate.id,
      rule_type: r.rule_type || r.type,
      chain: r.chain || null,
      evm_chain: r.evm_chain || null,
      source: r.source || 'other',
      collection_address: r.collection_address || r.collection || null,
      symbol: r.symbol || null,
      contract: r.contract || null,
      trait_type: r.trait_type || null,
      trait_value: r.trait_value || null,
      operator: r.operator || 'must_have',
      amount: r.amount ?? r.min_balance ?? r.min_count ?? null,
      sort_order: i,
    }))
    await db.from('token_gate_rules').insert(ruleRows)
  }

  // Return gate with rules
  const { data: fullRules } = await db
    .from('token_gate_rules')
    .select('*')
    .eq('gate_id', gate.id)
    .order('sort_order')

  return NextResponse.json({ gate: { ...gate, rules: fullRules || [] } }, { status: 201 })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
