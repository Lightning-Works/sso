/**
 * GET /api/divigo/status
 *
 * Tells the client whether DiviGo is configured server-side (DIVIGO_API_KEY
 * present) and whether the current signed-in user has linked a DiviGo
 * account. The client uses this to decide between the greyed "Inactive"
 * panel, the "Link your DiviGo account" form, and the active wallet UI.
 *
 * No secrets leak: we never return the API key, only a boolean.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { diviGoConfigured, diviGoProjectName } from '@/lib/divigo/client'
import { NextResponse } from 'next/server'

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const configured = diviGoConfigured()
  const projectName = diviGoProjectName() || null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ configured, projectName, linked: false, link: null })

  const { data: link } = await svc()
    .from('divigo_links').select('divigo_number, divigo_route, linked_at, last_verified_at')
    .eq('user_id', user.id).maybeSingle()

  return NextResponse.json({
    configured,
    projectName,
    linked: !!link,
    link: link || null,
  })
}
