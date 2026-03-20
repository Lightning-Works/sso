/**
 * GET /api/admin/logs?q=search&category=auth&limit=50&offset=0
 * Search and filter audit logs. Superadmin only.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Verify superadmin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'superadmin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''
    const category = searchParams.get('category') || ''
    const eventType = searchParams.get('event_type') || ''
    const userId = searchParams.get('user_id') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const dateFrom = searchParams.get('from') || ''
    const dateTo = searchParams.get('to') || ''

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filters
    if (category) query = query.eq('event_category', category)
    if (eventType) query = query.eq('event_type', eventType)
    if (userId) query = query.eq('user_id', userId)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)

    // Full-text search across username, email, description, event_type
    if (q) {
      query = query.or(`username.ilike.%${q}%,email.ilike.%${q}%,description.ilike.%${q}%,event_type.ilike.%${q}%,ip_address.ilike.%${q}%`)
    }

    const { data, error, count } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      logs: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
