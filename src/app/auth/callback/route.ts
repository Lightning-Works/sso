import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/account'
  const externalRedirect = searchParams.get('external_redirect')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If an external app requested this login, redirect back with tokens
      if (externalRedirect && data.session) {
        const sep = externalRedirect.includes('#') ? '&' : '#'
        return NextResponse.redirect(
          `${externalRedirect}${sep}access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&token_type=bearer`
        )
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
