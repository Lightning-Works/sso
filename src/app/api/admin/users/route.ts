/**
 * GET /api/admin/users?q=&role=&sort=&dir=&limit=&offset=
 * Lists users by merging Supabase auth.users (email, login timestamps,
 * ban status, provider) with the profiles table (username, display name,
 * role, avatar colors). Search/sort/paginate are applied in memory.
 * Admin or superadmin only.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/auth/adminContext'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const SORT_FIELDS = ['email', 'username', 'display_name', 'role', 'created_at', 'last_sign_in_at'] as const
type SortField = typeof SORT_FIELDS[number]

interface UserRow {
  id: string
  email: string
  username: string
  display_name: string
  role: string
  avatar_outer_color: string
  avatar_inner_color: string
  provider: string
  created_at: string | null
  last_sign_in_at: string | null
  banned: boolean
}

export async function GET(request: Request) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const roleFilter = searchParams.get('role') || ''
  const sort = (searchParams.get('sort') || 'created_at') as SortField
  const sortField: SortField = SORT_FIELDS.includes(sort) ? sort : 'created_at'
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)

  const db = getServiceDb()

  // Pull every auth user. Follow the server-provided `nextPage` rather than
  // inferring the last page from batch size — the server may clamp perPage,
  // which would silently truncate the list otherwise.
  const authUsers: { id: string; email?: string; created_at?: string; last_sign_in_at?: string; banned_until?: string; app_metadata?: Record<string, unknown> }[] = []
  let page = 1
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    authUsers.push(...(data.users || []))
    if (!data.nextPage) break
    page = data.nextPage
  }

  const { data: profiles } = await db
    .from('profiles')
    .select('id, username, display_name, role, avatar_outer_color, avatar_inner_color')
  const profileById = new Map((profiles || []).map((p: { id: string }) => [p.id, p]))

  const now = Date.now()
  let rows: UserRow[] = authUsers.map(u => {
    const p = (profileById.get(u.id) || {}) as Record<string, string>
    const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0
    return {
      id: u.id,
      email: u.email || '',
      username: p.username || '',
      display_name: p.display_name || '',
      role: p.role || 'user',
      avatar_outer_color: p.avatar_outer_color || '#000000',
      avatar_inner_color: p.avatar_inner_color || '#000000',
      provider: (u.app_metadata?.provider as string) || 'email',
      created_at: u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
      banned: bannedUntil > now,
    }
  })

  if (roleFilter) rows = rows.filter(r => r.role === roleFilter)
  if (q) {
    rows = rows.filter(r =>
      r.email.toLowerCase().includes(q) ||
      r.username.toLowerCase().includes(q) ||
      r.display_name.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
    )
  }

  rows.sort((a, b) => {
    const av = (a[sortField] || '') as string
    const bv = (b[sortField] || '') as string
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })

  const total = rows.length
  const pageRows = rows.slice(offset, offset + limit)

  return NextResponse.json({ users: pageRows, total, limit, offset })
}
