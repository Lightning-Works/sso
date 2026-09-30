/**
 * POST /api/agent/unlink   — remove the signed-in user's Telegram link(s) from the identity
 * graph. Session-authed. After this the character bots no longer recognise that Telegram id as
 * this person (until they link again).
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const PLATFORM = 'telegram'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { error } = await svc().from('platform_identities').delete()
    .eq('user_id', user.id).eq('platform', PLATFORM)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
