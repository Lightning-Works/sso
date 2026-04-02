import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logAuth } from '@/lib/audit/logger'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/account'
  const externalRedirect = searchParams.get('external_redirect')

  const errorDescription = searchParams.get('error_description')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const user = data.user
      const provider = user?.app_metadata?.provider || 'unknown'

      // Determine if this is a new signup or returning login
      // If the user was created within the last 10 seconds, treat as signup
      const isNewUser = user?.created_at && (Date.now() - new Date(user.created_at).getTime() < 10000)

      if (isNewUser) {
        await logAuth(supabase, 'auth.signup', {
          user_id: user?.id,
          email: user?.email,
          username: user?.user_metadata?.username,
          description: `Signed up via ${provider}`,
          metadata: { provider },
        })
      }

      await logAuth(supabase, 'auth.login.oauth', {
        user_id: user?.id,
        email: user?.email,
        username: user?.user_metadata?.username,
        description: `Logged in via ${provider}`,
        metadata: { provider },
      })

      // If an external app requested this login, redirect back with tokens
      if (externalRedirect && data.session) {
        const sep = externalRedirect.includes('#') ? '&' : '#'
        return NextResponse.redirect(
          `${externalRedirect}${sep}access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&token_type=bearer`
        )
      }

      // If logged in via app/company context, show success modal on login page
      const appParam = searchParams.get('app')
      const companyParam = searchParams.get('company')
      if (appParam || companyParam) {
        const successParams = new URLSearchParams({ login_success: 'true' })
        if (appParam) successParams.set('app', appParam)
        if (companyParam) successParams.set('company', companyParam)
        return NextResponse.redirect(`${origin}/login?${successParams.toString()}`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }

    // Code exchange failed
    const reason = errorDescription || error.message
    const callbackProvider = searchParams.get('provider') || 'unknown'
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${encodeURIComponent(reason)}&provider=${encodeURIComponent(callbackProvider)}`)
  }

  // No code received at all
  const reason = errorDescription || 'No authorization code received'
  const callbackProvider = searchParams.get('provider') || 'unknown'
  return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${encodeURIComponent(reason)}&provider=${encodeURIComponent(callbackProvider)}`)
}
