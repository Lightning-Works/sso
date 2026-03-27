import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — fetch all blacklisted NFT IDs (public, used by grid to auto-filter)
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('nft_blacklist')
    .select('nft_id, chain, contract, collection')

  if (error) {
    return NextResponse.json({ ids: [] })
  }

  return NextResponse.json({
    ids: (data || []).map(r => r.nft_id),
    entries: data || [],
  })
}

// POST — add NFTs to blacklist (superadmin only)
export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify superadmin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await request.json()
  const items: { nft_id: string; chain: string; contract: string; collection: string }[] = body.items || []

  if (items.length === 0) {
    return NextResponse.json({ error: 'No items provided' }, { status: 400 })
  }

  const rows = items.map(item => ({
    nft_id: item.nft_id,
    chain: item.chain || '',
    contract: item.contract || '',
    collection: item.collection || '',
    added_by: user.id,
  }))

  const { error } = await supabase
    .from('nft_blacklist')
    .upsert(rows, { onConflict: 'nft_id' })

  if (error) {
    console.error('NFT blacklist insert error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}

// DELETE — remove NFTs from blacklist (superadmin only)
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await request.json()
  const ids: string[] = body.ids || []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
  }

  const { error } = await supabase
    .from('nft_blacklist')
    .delete()
    .in('nft_id', ids)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
