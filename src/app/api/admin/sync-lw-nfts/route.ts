import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { syncContract } from '@/lib/blockchain/lw-nft-sync'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await request.json()
  const contractId = body.contract_id as number
  if (!contractId) return NextResponse.json({ error: 'contract_id required' }, { status: 400 })

  try {
    const result = await syncContract(contractId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
