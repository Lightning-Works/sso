'use client'

import { createClient } from '@/lib/supabase/client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { logAuth } from '@/lib/audit'
import { isRedirectAllowed } from '@/lib/auth/redirectOrigins'
import { mergeThemes, safeFontUrl, themeToCssVars, type LoginTheme } from '@/lib/theme'

const STORAGE_BASE = 'https://wemmrhypldubdplaohli.supabase.co/storage/v1/object/public'

function SignupContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  // Opened from an app's login page (?app=&redirect=): same branding, and the confirmation link
  // brings the person back to that app signed in. Without ?app it looks exactly as before.
  const searchParams = useSearchParams()
  const appSlug = searchParams.get('app')
  const rawRedirect = searchParams.get('redirect')
  const [logo, setLogo] = useState('/lightningworks_logo_fordark_800px.webp')
  const [themeCss, setThemeCss] = useState('')
  const [fontUrl, setFontUrl] = useState('')
  const [origins, setOrigins] = useState<string[]>([])
  const [ready, setReady] = useState(!appSlug)
  useEffect(() => {
    if (!appSlug) return
    supabase.from('apps').select('*, companies(logo_url, theme)').eq('slug', appSlug).single().then(({ data }) => {
      if (data) {
        if (data.companies?.logo_url) setLogo(`${STORAGE_BASE}/company-logos/${data.companies.logo_url}`)
        const merged = mergeThemes(data.companies?.theme as LoginTheme | null, data.theme as LoginTheme | null, null)
        setThemeCss(themeToCssVars(merged))
        setFontUrl(safeFontUrl(merged))
        setOrigins(data.redirect_origins || [])
      }
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSlug])
  const backQs = new URLSearchParams()
  for (const k of ['app', 'company', 'redirect']) { const v = searchParams.get(k); if (v) backQs.set(k, v) }
  const loginHref = '/login' + (backQs.toString() ? `?${backQs.toString()}` : '')
  const branding = (
    <>
      {themeCss && <style>{themeCss}</style>}
      {fontUrl && <link rel="stylesheet" href={fontUrl} />}
      {!ready && <style>{`body { background-color: transparent !important; } .lw-page { visibility: hidden !important; }`}</style>}
    </>
  )

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (username.length < 2 || username.length > 15) { setError('Username must be 2-15 characters.'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('Username can only contain letters, numbers, and underscores.'); return }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.toLowerCase(), display_name: username },
        // back through our callback, which hands the tokens to the app (it re-checks the redirect too)
        ...(appSlug && rawRedirect && isRedirectAllowed(rawRedirect, origins, process.env.NEXT_PUBLIC_ALLOWED_REDIRECT_ORIGINS)
          ? { emailRedirectTo: `${window.location.origin}/auth/callback?${new URLSearchParams({ app: appSlug, external_redirect: rawRedirect }).toString()}` }
          : {}),
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else {
      await logAuth(supabase, 'auth.signup', {
        email,
        username: username.toLowerCase(),
        description: `New account created for ${email}`,
      })
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="lw-page">
        {branding}
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <h1 className="lw-heading-xl" style={{ marginBottom: '1rem' }}>Check Your Email</h1>
          <p className="lw-subtitle">
            We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--lw-text-white)' }}>{email}</strong>. Click the link to verify your account.
          </p>
          <a href={loginHref} className="lw-btn lw-btn-primary" style={{ display: 'inline-block', marginTop: '1.5rem', width: 'auto', padding: '0.75rem 2rem' }}>
            Back to Sign In
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="lw-page">
      {branding}
      <div className="lw-panel-content">
        <div className="lw-header">
          <img src={logo} alt="Logo" className="lw-logo" />
          <p className="lw-subtitle">Create your account</p>
        </div>

        <div className="lw-panel">
          <form onSubmit={handleSignup} className="lw-form">
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="lw-input" style={{backgroundColor:'rgb(26,17,46)',color:'#bab1a8'}} required />
            {error && <p className="lw-error">{error}</p>}
            <button type="submit" disabled={loading} className="lw-btn lw-btn-primary">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <p className="lw-footer-text" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            Already have an account?{' '}<a href={loginHref} className="lw-link">Sign in</a>
          </p>
        </div>

        <p className="lw-footer-text" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          By creating an account, you agree to our{' '}
          <a href="/terms" className="lw-link">Terms of Service</a>{' '}and{' '}
          <a href="/privacy" className="lw-link">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="lw-page"><p className="lw-subtitle">Loading...</p></div>}>
      <SignupContent />
    </Suspense>
  )
}
