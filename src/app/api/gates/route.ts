import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/verifyAdmin'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const VALID_RULE_TYPES = ['nft_ownership', 'token_balance', 'nft_trait', 'nft_collection_count', 'custom_token'] as const
const VALID_OPERATORS = ['must_have', 'must_not_have', 'gte', 'lte'] as const
const MAX_NAME_LENGTH = 200
const MAX_DESC_LENGTH = 2000
const MAX_RULES = 20

function validateRules(rules: Record<string, unknown>[]): string | null {
  if (rules.length > MAX_RULES) return `Maximum ${MAX_RULES} rules per gate`
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    const ruleType = (r.rule_type || r.type) as string
    if (!VALID_RULE_TYPES.includes(ruleType as typeof VALID_RULE_TYPES[number])) {
      return `Rule ${i + 1}: invalid rule_type "${ruleType}". Must be one of: ${VALID_RULE_TYPES.join(', ')}`
    }
    const op = (r.operator || 'must_have') as string
    if (!VALID_OPERATORS.includes(op as typeof VALID_OPERATORS[number])) {
      return `Rule ${i + 1}: invalid operator "${op}". Must be one of: ${VALID_OPERATORS.join(', ')}`
    }
    const amount = r.amount ?? r.min_balance ?? r.min_count
    if (amount !== undefined && amount !== null && (typeof amount !== 'number' || amount < 0)) {
      return `Rule ${i + 1}: amount must be a non-negative number`
    }
  }
  return null
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
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const body = await request.json()
  const { app_slug, name, description, rules } = body as {
    app_slug: string; name: string; description?: string; rules?: Record<string, unknown>[]
  }

  if (!app_slug || !name) {
    return NextResponse.json({ error: 'app_slug and name required' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `name must be under ${MAX_NAME_LENGTH} characters` }, { status: 400 })
  }
  if (description && description.length > MAX_DESC_LENGTH) {
    return NextResponse.json({ error: `description must be under ${MAX_DESC_LENGTH} characters` }, { status: 400 })
  }
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: 'At least one rule is required' }, { status: 400 })
  }
  const ruleError = validateRules(rules)
  if (ruleError) return NextResponse.json({ error: ruleError }, { status: 400 })

  const db = getServiceDb()

  // Verify app exists
  const { data: app } = await db.from('apps').select('slug').eq('slug', app_slug).single()
  if (!app) return NextResponse.json({ error: `App "${app_slug}" not found` }, { status: 404 })

  // Generate display_id with retry for race conditions
  let gate = null
  let gateErr = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const displayId = await getNextDisplayId(db, app_slug)
    const result = await db
      .from('token_gates')
      .insert({ app_slug, display_id: displayId, name, description: description || '' })
      .select()
      .single()
    if (!result.error) { gate = result.data; break }
    if (result.error.code === '23505') continue // UNIQUE violation, retry
    gateErr = result.error; break
  }

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
