/**
 * GET    /api/admin/users/:id  — full profile + auth fields + computed stats
 * PATCH  /api/admin/users/:id  — edit profile fields and role (guarded)
 * DELETE /api/admin/users/:id  — permanently delete auth user + profile
 *
 * Admin or superadmin for read/profile edits.
 * Granting admin/superadmin, or deleting, requires superadmin.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/auth/adminContext'
import { logAdmin } from '@/lib/audit/logger'

function getServiceDb() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const PROFILE_FIELDS = ['display_name', 'username', 'avatar_outer_color', 'avatar_inner_color', 'avatar_pan_x', 'avatar_pan_y', 'avatar_zoom'] as const
const VALID_ROLES = ['user', 'admin', 'superadmin']

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const { id } = await params
  const db = getServiceDb()

  const { data: authData, error: authError } = await db.auth.admin.getUserById(id)
  if (authError || !authData?.user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const authUser = authData.user

  const { data: profile } = await db.from('profiles').select('*').eq('id', id).single()

  // Resolve avatar URL — custom upload (signed) > OAuth provider avatar
  let avatarUrl: string | null = null
  if (profile?.avatar_url) {
    if (profile.avatar_url.startsWith('http')) {
      avatarUrl = profile.avatar_url
    } else {
      const { data: signed } = await db.storage.from('user_avatars').createSignedUrl(profile.avatar_url, 604800)
      avatarUrl = signed?.signedUrl || null
    }
  }
  if (!avatarUrl) {
    const meta = authUser.user_metadata || {}
    avatarUrl = meta.avatar_url || meta.picture || null
  }

  // Stats from audit_logs
  const { data: firstLoginRows } = await db
    .from('audit_logs')
    .select('created_at')
    .eq('user_id', id)
    .ilike('event_type', 'auth.login%')
    .order('created_at', { ascending: true })
    .limit(1)
  const firstLogin = firstLoginRows?.[0]?.created_at || authUser.created_at || null

  const { data: verifyRows } = await db
    .from('audit_logs')
    .select('metadata, created_at')
    .eq('user_id', id)
    .eq('event_type', 'auth.verify')
    .order('created_at', { ascending: false })
    .limit(2000)
  const appsMap = new Map<string, { origin: string; count: number; last_used: string }>()
  for (const row of verifyRows || []) {
    const origin = ((row.metadata as Record<string, unknown>)?.app_origin as string) || 'unknown'
    const existing = appsMap.get(origin)
    if (existing) existing.count++
    else appsMap.set(origin, { origin, count: 1, last_used: row.created_at })
  }
  const appsUsed = Array.from(appsMap.values()).sort((a, b) => b.count - a.count)

  const { data: recentActivity } = await db
    .from('audit_logs')
    .select('event_type, event_category, description, ip_address, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      username: profile?.username || '',
      display_name: profile?.display_name || '',
      role: profile?.role || 'user',
      avatar_url: avatarUrl,
      avatar_outer_color: profile?.avatar_outer_color || '#000000',
      avatar_inner_color: profile?.avatar_inner_color || '#000000',
      avatar_pan_x: profile?.avatar_pan_x ?? 0.5,
      avatar_pan_y: profile?.avatar_pan_y ?? 0.5,
      avatar_zoom: profile?.avatar_zoom ?? 1.0,
      provider: authUser.app_metadata?.provider || 'email',
      created_at: authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at || null,
      banned: authUser.banned_until ? new Date(authUser.banned_until).getTime() > Date.now() : false,
      first_login: firstLogin,
      apps_used: appsUsed,
      recent_activity: recentActivity || [],
    },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const db = getServiceDb()

  const { data: target } = await db.from('profiles').select('role, username').eq('id', id).single()
  const targetRole = target?.role || 'user'
  const privileged = (r: string) => r === 'admin' || r === 'superadmin'

  // A non-superadmin may not modify an admin/superadmin account at all
  // (consistent with the ban route and the role-change rule).
  if (admin.role !== 'superadmin' && privileged(targetRole)) {
    return NextResponse.json({ error: 'Only a superadmin can modify an admin/superadmin account' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of PROFILE_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field]
  }

  // Username uniqueness — only when set to a non-empty value that changed
  // (many OAuth users share an empty username, which is not a conflict).
  const newUsername = typeof updates.username === 'string' ? updates.username.trim() : undefined
  if (newUsername && newUsername !== (target?.username || '')) {
    const { data: clash } = await db
      .from('profiles')
      .select('id')
      .eq('username', newUsername)
      .neq('id', id)
      .limit(1)
    if (clash && clash.length > 0) {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
    }
  }

  // Role change — guarded
  if (body.role !== undefined && body.role !== targetRole) {
    const newRole = body.role
    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (id === admin.userId) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 403 })
    }
    if (admin.role !== 'superadmin' && privileged(newRole)) {
      return NextResponse.json({ error: 'Only a superadmin can grant admin/superadmin roles' }, { status: 403 })
    }
    updates.role = newRole
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  // Upsert (not update): not every auth user has a profiles row — the
  // codebase reads profiles defensively, so editing a profile-less user
  // must create the row rather than 500 on "no rows".
  const { data: updated, error } = await db
    .from('profiles')
    .upsert({ id, ...updates }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (updates.role !== undefined) {
    await logAdmin(db, 'admin.user.role_change', {
      user_id: id,
      description: `Role changed from ${targetRole} to ${updates.role} by ${admin.email || admin.userId}`,
      metadata: { actor_id: admin.userId, from: targetRole, to: updates.role },
    })
  }
  await logAdmin(db, 'admin.user.update', {
    user_id: id,
    description: `Profile edited by ${admin.email || admin.userId}`,
    metadata: { actor_id: admin.userId, fields: Object.keys(updates) },
  })

  return NextResponse.json({ user: updated })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminContext(request)
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Only a superadmin can delete users' }, { status: 403 })
  }

  const { id } = await params
  if (id === admin.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 403 })
  }

  const db = getServiceDb()
  const { error: delError } = await db.auth.admin.deleteUser(id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  await db.from('profiles').delete().eq('id', id)

  await logAdmin(db, 'admin.user.delete', {
    user_id: id,
    description: `User deleted by ${admin.email || admin.userId}`,
    metadata: { actor_id: admin.userId },
  })

  return NextResponse.json({ ok: true })
}
