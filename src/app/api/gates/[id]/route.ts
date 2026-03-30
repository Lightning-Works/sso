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

// GET /api/gates/:id — Get a single gate with all rules
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServiceDb()

  const { data: gate, error } = await db.from('token_gates').select('*').eq('id', id).single()
  if (error || !gate) return NextResponse.json({ error: 'Gate not found' }, { status: 404 })

  const { data: rules } = await db
    .from('token_gate_rules')
    .select('*')
    .eq('gate_id', id)
    .order('sort_order')

  return NextResponse.json({ gate: { ...gate, rules: rules || [] } }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

// PUT /api/gates/:id — Update gate and replace rules
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = await verifyAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const { name, description, is_active, rules } = body as {
    name?: string; description?: string; is_active?: boolean; rules?: Record<string, unknown>[]
  }

  const db = getServiceDb()

  // Update gate
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (is_active !== undefined) updates.is_active = is_active

  const { data: gate, error } = await db
    .from('token_gates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !gate) return NextResponse.json({ error: 'Gate not found' }, { status: 404 })

  // Replace rules if provided
  if (rules !== undefined) {
    await db.from('token_gate_rules').delete().eq('gate_id', id)

    if (rules.length > 0) {
      const ruleRows = rules.map((r, i) => ({
        gate_id: id,
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
  }

  const { data: fullRules } = await db
    .from('token_gate_rules')
    .select('*')
    .eq('gate_id', id)
    .order('sort_order')

  return NextResponse.json({ gate: { ...gate, rules: fullRules || [] } })
}

// DELETE /api/gates/:id
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = await verifyAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const db = getServiceDb()
  const { error } = await db.from('token_gates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
